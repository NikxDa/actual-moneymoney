import actual from '@actual-app/api';
import type { CreateTransaction } from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import util from 'node:util';

import {
    ActualServerConfig,
    DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS,
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

class ActualApiTimeoutError extends Error {
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
        return (
            this.serverConfig.requestTimeoutMs ??
            DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS
        );
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
                reject(new ActualApiTimeoutError(operation, timeoutMs));
            }, timeoutMs);
        });

        try {
            const result = (await Promise.race([
                callback(),
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

            const wrappedError = new Error(
                `Actual API operation '${operation}' failed: ${message}`
            );

            if (error instanceof Error) {
                (wrappedError as Error & { cause?: Error }).cause = error;
            }
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
        return await this.runActualRequest(
            `import transactions for account '${accountId}'`,
            () =>
                actual.importTransactions(accountId, transactions, {
                    defaultCleared: false,
                }),
            [`Account ID: ${accountId}`]
        );
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

    private patchConsole(): () => void {
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
