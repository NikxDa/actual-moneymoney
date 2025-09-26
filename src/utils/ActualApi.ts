import actual from '@actual-app/api';
import type { CreateTransaction } from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import util from 'node:util';

import type { ActualServerConfig } from './config.js';
import {
    DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS,
    FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS,
} from './config.js';
import Logger from './Logger.js';
import { DEFAULT_DATA_DIR } from './shared.js';

const isActualNoise = (args: unknown[]) => {
    if (args.length === 0) {
        return false;
    }

    const message = util.format(...(args as [unknown, ...unknown[]]));

    const noisyPrefixes = [
        'Got messages from server',
        'Syncing since',
        'SENT -------',
        'RECEIVED -------',
    ];

    return noisyPrefixes.some((prefix) => message.startsWith(prefix));
};
const suppressIfNoisy =
    <TArgs extends unknown[]>(
        original: (...args: TArgs) => void
    ): ((...args: TArgs) => void) =>
    (...args: TArgs): void => {
        if (isActualNoise(args)) {
            return;
        }

        original(...args);
    };

const normalizeForHash = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeForHash(item));
    }

    if (value && typeof value === 'object') {
        const sortedEntries = Object.entries(
            value as Record<string, unknown>
        ).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

        return sortedEntries.reduce<Record<string, unknown>>(
            (accumulator, [key, nestedValue]) => {
                accumulator[key] = normalizeForHash(nestedValue);
                return accumulator;
            },
            {}
        );
    }

    return value;
};

const createErrorWithCause = (message: string, cause: Error): Error => {
    const ErrorCtor = Error as ErrorConstructor & {
        new (message?: string, options?: { cause?: unknown }): Error;
    };
    try {
        return new ErrorCtor(message, { cause });
    } catch {
        const fallback = new Error(message);
        (fallback as Error & { cause?: Error }).cause = cause;
        return fallback;
    }
};

export class ActualApiTimeoutError extends Error {
    constructor(operation: string, timeoutMs: number) {
        super(
            `Actual API operation '${operation}' timed out after ${timeoutMs}ms`
        );
        this.name = 'ActualApiTimeoutError';
    }
}

class ActualApi {
    protected isInitialized = false;

    constructor(
        private serverConfig: ActualServerConfig,
        private logger: Logger
    ) {}

    private getRequestTimeoutMs(): number {
        const ms = this.serverConfig.requestTimeoutMs;
        if (typeof ms === 'number') {
            if (ms > 0) {
                const cappedMs = Math.min(
                    ms,
                    DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS
                );
                if (cappedMs !== ms) {
                    this.logger.warn(
                        `requestTimeoutMs capped at ${DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS}ms`
                    );
                }
                return cappedMs;
            }
            this.logger.warn(
                `requestTimeoutMs must be > 0; falling back to ${FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS}ms`
            );
            return FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS;
        }
        return FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS;
    }

    private createContextHints(additional?: string | string[]): string[] {
        const extras = Array.isArray(additional)
            ? additional
            : additional
              ? [additional]
              : [];

        return [`Server URL: ${this.serverConfig.serverUrl}`, ...extras];
    }

    private async runActualRequest<T>(
        operation: string,
        callback: () => Promise<T>,
        additionalHints?: string | string[]
    ): Promise<T> {
        const timeoutMs = this.getRequestTimeoutMs();
        let timeoutHandle: NodeJS.Timeout | null = null;
        const hints = this.createContextHints(additionalHints);
        const unpatch = this.patchConsole();

        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                const timeoutError = new ActualApiTimeoutError(
                    operation,
                    timeoutMs
                );
                Promise.resolve(actual.shutdown())
                    .catch((shutdownError) => {
                        const reason =
                            shutdownError instanceof Error
                                ? shutdownError.message
                                : String(shutdownError);
                        this.logger.warn(
                            `Actual client shutdown after timeout failed: ${reason}`,
                            hints
                        );
                    })
                    .finally(() => {
                        this.isInitialized = false;
                        reject(timeoutError);
                    });
            }, timeoutMs);
        });

        let rawCallback: Promise<T>;
        try {
            rawCallback = Promise.resolve(callback());
        } catch (error) {
            rawCallback = Promise.reject<T>(error);
        }

        const racingCallback = rawCallback.then(
            (value) => value,
            (error) => {
                throw error;
            }
        );
        rawCallback.catch(() => {});

        try {
            const result = (await Promise.race([
                racingCallback,
                timeoutPromise,
            ])) as T;
            return result;
        } catch (error) {
            if (error instanceof ActualApiTimeoutError) {
                this.logger.error(error.message, hints);
                throw error;
            }

            const message =
                error instanceof Error ? error.message : 'Unknown error';


            const wrappedError =
                error instanceof Error
                    ? createErrorWithCause(
                          `Actual API operation '${operation}' failed: ${message}`,
                          error
                      )
                    : new Error(
                          `Actual API operation '${operation}' failed: ${message}`
                      );
            this.logger.error(wrappedError.message, hints);
            throw wrappedError;
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            unpatch();
        }
    }

    public async init(): Promise<void> {
        const actualDataDir = DEFAULT_DATA_DIR;

        const dataDirExists = await fs
            .access(actualDataDir)
            .then(() => true)
            .catch(() => false);

        if (!dataDirExists) {
            await fs.mkdir(actualDataDir, { recursive: true });
            this.logger.debug(
                `Created Actual data directory at ${actualDataDir}`
            );
        }

        this.logger.debug(
            `Initializing Actual instance for server ${this.serverConfig.serverUrl} with data directory ${actualDataDir}`
        );

        await this.runActualRequest('initialize session', () =>
            actual.init({
                dataDir: actualDataDir,
                serverURL: this.serverConfig.serverUrl,
                password: this.serverConfig.serverPassword,
            })
        );

        this.isInitialized = true;
    }

    public async ensureInitialization(): Promise<void> {
        if (!this.isInitialized) {
            await this.init();
        }
    }

    public async sync(additionalHints?: string | string[]): Promise<void> {
        await this.ensureInitialization();
        await this.runActualRequest(
            'sync budget',
            () => actual.sync(),
            additionalHints
        );
    }

    public async getAccounts(): ReturnType<typeof actual.getAccounts> {
        await this.ensureInitialization();
        return await this.runActualRequest('fetch accounts', () =>
            actual.getAccounts()
        );
    }

    public async loadBudget(budgetId: string): Promise<void> {
        await this.ensureInitialization();

        const budgetConfig = this.serverConfig.budgets.find(
            (b) => b.syncId === budgetId
        );

        if (!budgetConfig) {
            throw new Error(`No budget with syncId '${budgetId}' found.`);
        }

        const budgetHints = [`Budget sync ID: ${budgetConfig.syncId}`];

        this.logger.debug(
            `Downloading budget with syncId '${budgetConfig.syncId}'...`
        );
        await this.runActualRequest(
            `download budget '${budgetConfig.syncId}'`,
            () =>
                actual.downloadBudget(
                    budgetConfig.syncId,
                    budgetConfig.e2eEncryption.enabled
                        ? {
                              password: budgetConfig.e2eEncryption.password,
                          }
                        : undefined
                ),
            budgetHints
        );

        this.logger.debug(
            `Loading budget with syncId '${budgetConfig.syncId}'...`
        );

        // Handle directory naming mismatch - create symlink if needed
        const actualDataDir = DEFAULT_DATA_DIR;
        const budgetDirs = await fs.readdir(actualDataDir).catch(() => []);
        const matchingDir = budgetDirs.find(dir => {
            return dir !== '.' && dir !== '..';
        });

        if (matchingDir) {
            try {
                const metadataPath = path.join(actualDataDir, matchingDir, 'metadata.json');
                const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
                if (metadata.groupId === budgetConfig.syncId) {
                    // Create symlink with sync ID name for the Actual API
                    const syncIdDir = path.join(actualDataDir, budgetConfig.syncId);
                    const actualDir = path.join(actualDataDir, matchingDir);

                    try {
                        await fs.access(syncIdDir);
                    } catch {
                        await fs.symlink(actualDir, syncIdDir);
                        this.logger.debug(`Created symlink: ${budgetConfig.syncId} -> ${matchingDir}`);
                    }
                }
            } catch (error) {
                // Ignore metadata read errors
            }
        }

        await this.runActualRequest(
            `load budget '${budgetConfig.syncId}'`,
            () => actual.loadBudget(budgetConfig.syncId),
            budgetHints
        );

        this.logger.debug(
            `Synchronizing budget with syncId '${budgetConfig.syncId}'...`
        );
        await this.sync(budgetHints);
    }

    public async importTransactions(
        accountId: string,
        transactions: CreateTransaction[]
    ): ReturnType<typeof actual.importTransactions> {
        await this.ensureInitialization();
        const dedupedTransactions = this.normalizeAndDeduplicateTransactions(
            accountId,
            transactions
        );
        const importOptions = { defaultCleared: false };
        const removed = transactions.length - dedupedTransactions.length;
        if (removed > 0) {
            this.logger.debug(
                `Deduplicated ${removed} duplicate transactions before import`,
                [`Account ID: ${accountId}`]
            );
        }

        return await this.runActualRequest(
            `import transactions for account '${accountId}'`,
            () =>
                actual.importTransactions(
                    accountId,
                    dedupedTransactions,
                    importOptions
                ),
            [`Account ID: ${accountId}`]
        );
    }

    private normalizeAndDeduplicateTransactions(
        accountId: string,
        transactions: CreateTransaction[]
    ): CreateTransaction[] {
        const dedupedTransactions: CreateTransaction[] = [];
        const seenImportedIds = new Set<string>();

        for (const transaction of transactions) {
            const normalized = this.ensureImportedId(accountId, transaction);
            const importedId = normalized.imported_id;

            if (importedId && seenImportedIds.has(importedId)) {
                continue;
            }

            if (importedId) {
                seenImportedIds.add(importedId);
            }

            dedupedTransactions.push(normalized);
        }

        return dedupedTransactions;
    }

    public async getTransactions(
        accountId: string,
        options?: { from?: Date; to?: Date }
    ): ReturnType<typeof actual.getTransactions> {
        let from = options?.from ?? new Date(2000, 0, 1);
        let to = options?.to ?? null;
        if (to && from > to) {
            [from, to] = [to, from];
        }
        const startDate = format(from, 'yyyy-MM-dd');
        const endDate = to ? format(to, 'yyyy-MM-dd') : null;

        await this.ensureInitialization();
        const rangeHint = endDate
            ? `Date range: ${startDate} – ${endDate}`
            : `Date range: ${startDate} onwards`;

        return await this.runActualRequest(
            `fetch transactions for account '${accountId}'`,
            () =>
                endDate
                    ? actual.getTransactions(accountId, startDate, endDate)
                    : actual.getTransactions(accountId, startDate),
            [`Account ID: ${accountId}`, rangeHint]
        );
    }

    public async shutdown(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        try {
            await this.runActualRequest('shutdown session', () =>
                actual.shutdown()
            );
        } finally {
            this.isInitialized = false;
        }
    }

    private static suppressDepth = 0;
    private static originals: {
        log: typeof console.log;
        info: typeof console.info;
        debug: typeof console.debug;
        warn: typeof console.warn;
    } | null = null;

    private ensureImportedId(
        accountId: string,
        transaction: CreateTransaction
    ): CreateTransaction {
        const importedId = transaction.imported_id;

        if (typeof importedId === 'string') {
            const trimmedImportedId = importedId.trim();

            if (trimmedImportedId.length > 0) {
                if (trimmedImportedId === importedId) {
                    return transaction;
                }

                return {
                    ...transaction,
                    imported_id: trimmedImportedId,
                };
            }
        }

        return {
            ...transaction,
            imported_id: this.createFallbackImportedId(accountId, transaction),
        };
    }


    private createFallbackImportedId(
        accountId: string,
        transaction: CreateTransaction
    ): string {
        const payeeId = (transaction as { payee_id?: string }).payee_id ?? '';
        const payee = (transaction as { payee?: string }).payee ?? '';
        const rawSubtransactions = (
            transaction as {
                subtransactions?: unknown;
            }
        ).subtransactions;
        const normalizedSubtransactions = Array.isArray(rawSubtransactions)
            ? (normalizeForHash(rawSubtransactions) as unknown[])
            : [];

        const normalized = {
            accountId,
            date: transaction.date,
            amount: transaction.amount,
            imported_payee:
                (transaction as { imported_payee?: string }).imported_payee ??
                '',
            category: (transaction as { category?: string }).category ?? '',
            notes: transaction.notes ?? '',
            transfer_id:
                (transaction as { transfer_id?: string }).transfer_id ?? '',
            cleared:
                typeof transaction.cleared === 'boolean'
                    ? String(transaction.cleared)
                    : '',
            payee_id: payeeId,
            payee,
            subtransactions: normalizedSubtransactions,
        };

        const hash = createHash('sha256')
            .update(JSON.stringify(normalized))
            .digest('hex');

        return `mm-sync-${hash}`;
    }

    private patchConsole(): () => void {
        // Note: This temporarily monkey-patches the global console methods for the
        // entire process while an Actual request is in flight. Concurrent requests
        // share the suppression window, so unrelated log output may be filtered.
        // The Actual client may still emit logs outside this window (e.g. after a
        // timeout) because the SDK lacks granular logger hooks.
        if (ActualApi.suppressDepth === 0) {
            ActualApi.originals = {
                log: console.log,
                info: console.info,
                debug: console.debug,
                warn: console.warn,
            };
            const originals = ActualApi.originals;
            console.log = suppressIfNoisy(
                (...args: Parameters<typeof console.log>) => {
                    originals.log.apply(console, args);
                }
            );
            console.info = suppressIfNoisy(
                (...args: Parameters<typeof console.info>) => {
                    originals.info.apply(console, args);
                }
            );
            console.debug = suppressIfNoisy(
                (...args: Parameters<typeof console.debug>) => {
                    originals.debug.apply(console, args);
                }
            );
            console.warn = suppressIfNoisy(
                (...args: Parameters<typeof console.warn>) => {
                    originals.warn.apply(console, args);
                }
            );
        }
        ActualApi.suppressDepth++;
        return () => {
            ActualApi.suppressDepth--;
            if (ActualApi.suppressDepth === 0 && ActualApi.originals) {
                console.log = ActualApi.originals.log;
                console.info = ActualApi.originals.info;
                console.debug = ActualApi.originals.debug;
                console.warn = ActualApi.originals.warn;
                ActualApi.originals = null;
            }
        };
    }
}

export default ActualApi;
