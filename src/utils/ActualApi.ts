import actual from '@actual-app/api';
// Type for transaction import - matches the ImportTransaction interface
type ImportTransaction = {
    account?: string;
    date: string;
    amount?: number;
    payee?: string;
    payee_name?: string;
    imported_payee?: string;
    category?: string;
    notes?: string;
    imported_id?: string;
    transfer_id?: string;
    cleared?: boolean;
    subtransactions?: Array<{
        amount: number;
        category?: string;
        notes?: string;
    }>;
};
import { format } from 'date-fns';
import fs from 'fs/promises';
import type { Dirent } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import util from 'node:util';

import type { ActualServerConfig } from './config.js';
import { DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS, FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS } from './config.js';
import Logger, { LogLevel } from './Logger.js';
import { DEFAULT_DATA_DIR } from './shared.js';

// Enhanced pattern matching with categorization and regex support
const SUPPRESSED_PATTERNS = [
    { pattern: /^Got messages from server/i, type: 'sync', category: 'network' },
    { pattern: /^Syncing since/i, type: 'sync', category: 'network' },
    { pattern: /^SENT -------/i, type: 'network', category: 'network' },
    { pattern: /^RECEIVED -------/i, type: 'network', category: 'network' },
    { pattern: /^Performing transaction reconciliation/i, type: 'reconciliation', category: 'data' },
    { pattern: /^Performing transaction reconciliation matching/i, type: 'reconciliation', category: 'data' },
    // Add more patterns for common Actual SDK noise
    { pattern: /^Loading budget/i, type: 'budget', category: 'data' },
    { pattern: /^Budget loaded/i, type: 'budget', category: 'data' },
    { pattern: /^Saving budget/i, type: 'budget', category: 'data' },
    { pattern: /^Budget saved/i, type: 'budget', category: 'data' },
    { pattern: /^Applying migration/i, type: 'migration', category: 'data' },
    { pattern: /^Migration applied/i, type: 'migration', category: 'data' },
];

// Performance optimization: Cache for repeated evaluations
class ConsoleFilterCache {
    private patternCache = new Map<string, boolean>();
    private lastEvaluation: { args: unknown[]; decision: ConsoleNoiseDecision } | null = null;
    private maxCacheSize = 1000; // Prevent memory leaks

    private getCacheKey(args: unknown[]): string {
        // Create a simple hash for caching
        return args.map((arg) => (typeof arg === 'string' ? arg.substring(0, 50) : String(arg))).join('|');
    }

    public evaluateWithCache(args: unknown[]): ConsoleNoiseDecision {
        // Check if we're evaluating the same args as last time (common case)
        if (this.lastEvaluation && this.arraysEqual(this.lastEvaluation.args, args)) {
            return this.lastEvaluation.decision;
        }

        // Check cache for simple string patterns
        const cacheKey = this.getCacheKey(args);
        if (this.patternCache.has(cacheKey)) {
            const cached = this.patternCache.get(cacheKey);
            const decision = cached
                ? { action: 'suppress' as const, fallbackMessage: 'cached', type: 'cached', category: 'cached' }
                : { action: 'passthrough' as const };

            this.lastEvaluation = { args, decision };
            return decision;
        }

        // Evaluate normally
        const decision = evaluateActualConsoleOutput(args);

        // Cache the result for simple cases
        if (decision.action === 'passthrough' || (decision.action === 'suppress' && !decision.debugHints?.length)) {
            this.patternCache.set(cacheKey, decision.action === 'suppress');

            // Prevent memory leaks by limiting cache size
            if (this.patternCache.size > this.maxCacheSize) {
                const firstKey = this.patternCache.keys().next().value;
                if (firstKey !== undefined) {
                    this.patternCache.delete(firstKey);
                }
            }
        }

        this.lastEvaluation = { args, decision };
        return decision;
    }

    private arraysEqual(a: unknown[], b: unknown[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    public clearCache(): void {
        this.patternCache.clear();
        this.lastEvaluation = null;
    }
}

// Global cache instance
const consoleFilterCache = new ConsoleFilterCache();

// Legacy support for simple prefix matching
const SUPPRESSED_PREFIXES = [
    'Got messages from server',
    'Syncing since',
    'SENT -------',
    'RECEIVED -------',
    'Performing transaction reconciliation',
    'Performing transaction reconciliation matching',
];

type ConsoleNoiseDecision =
    | { action: 'passthrough' }
    | {
          action: 'suppress';
          debugMessage?: string;
          debugHints?: string[];
          fallbackMessage: string;
          type?: string;
          category?: string;
      };

const evaluateActualConsoleOutput = (args: unknown[]): ConsoleNoiseDecision => {
    if (args.length === 0) {
        return { action: 'passthrough' };
    }

    // Handle edge cases for malformed console output
    if (args.some((arg) => arg === null && typeof arg !== 'object')) {
        return { action: 'passthrough' };
    }

    const formatted = util.format(...(args as [unknown, ...unknown[]]));
    const [firstArg, ...rest] = args;

    if (typeof firstArg === 'string') {
        const trimmedFirstArg = firstArg.trim();

        // Handle empty or whitespace-only strings
        if (trimmedFirstArg.length === 0) {
            return { action: 'passthrough' };
        }

        // Enhanced debug data processing with better error handling
        if (/^Debug data for the operations:?/i.test(trimmedFirstArg)) {
            const debugHints: string[] = [];
            const metadata: Record<string, unknown> = {
                timestamp: new Date().toISOString(),
                source: 'actual-sdk',
                operation: 'debug-data',
            };

            for (const entry of rest) {
                if (typeof entry === 'undefined') {
                    continue;
                }

                if (entry && typeof entry === 'object') {
                    let serialised = '';
                    try {
                        // Handle circular references and complex objects
                        serialised = JSON.stringify(entry, null, 2);
                    } catch (_serializationError) {
                        // Fallback to util.inspect with better error handling
                        serialised = util.inspect(entry, {
                            depth: 4,
                            showHidden: false,
                            colors: false,
                            maxArrayLength: 10,
                        });
                        metadata.serializationError = true;
                    }

                    debugHints.push(serialised);
                    continue;
                }

                debugHints.push(String(entry));
            }

            if (debugHints.length === 0) {
                debugHints.push(formatted);
            }

            // Add metadata as first hint
            debugHints.unshift(JSON.stringify(metadata, null, 2));

            return {
                action: 'suppress',
                debugMessage: 'Actual sync debug data emitted by SDK',
                debugHints,
                fallbackMessage: formatted,
                type: 'debug',
                category: 'data',
            };
        }

        // Enhanced pattern matching with regex support
        const matchedPattern = SUPPRESSED_PATTERNS.find((p) => p.pattern.test(trimmedFirstArg));
        if (matchedPattern) {
            return {
                action: 'suppress',
                debugMessage: `Actual SDK ${matchedPattern.type} output`,
                fallbackMessage: formatted,
                type: matchedPattern.type,
                category: matchedPattern.category,
            };
        }

        // Fallback to legacy prefix matching for backward compatibility
        if (SUPPRESSED_PREFIXES.some((prefix) => trimmedFirstArg.startsWith(prefix))) {
            return {
                action: 'suppress',
                debugMessage: formatted,
                fallbackMessage: formatted,
                type: 'legacy',
                category: 'unknown',
            };
        }
    }

    return { action: 'passthrough' };
};

// Enhanced console interceptor with granular log level control and performance optimization
const createConsoleInterceptor =
    <TArgs extends unknown[]>(
        logger: Logger,
        original: (...args: TArgs) => void,
        options: {
            minLevelForDebug?: LogLevel;
            enableCategorization?: boolean;
            categoryFilter?: string[];
            enableCaching?: boolean;
        } = {}
    ) =>
    (...args: TArgs): void => {
        // Use cache for performance optimization if enabled
        const decision =
            options.enableCaching !== false
                ? consoleFilterCache.evaluateWithCache(args)
                : evaluateActualConsoleOutput(args);

        if (decision.action === 'passthrough') {
            original.apply(console, args);
            return;
        }

        if (decision.action === 'suppress') {
            const minLevel = options.minLevelForDebug ?? LogLevel.DEBUG;
            const currentLevel = logger.getLevel();

            // Check if we should log based on level and category filtering
            const shouldLog =
                currentLevel >= minLevel &&
                (!options.categoryFilter || !decision.category || options.categoryFilter.includes(decision.category));

            if (shouldLog) {
                const hints = decision.debugHints?.length ? decision.debugHints : undefined;
                let message = decision.debugMessage ?? decision.fallbackMessage;

                // Add categorization to debug messages for better filtering
                if (options.enableCategorization && decision.type && decision.category) {
                    message = `[${decision.category.toUpperCase()}:${decision.type.toUpperCase()}] ${message}`;
                }

                // Use appropriate log level based on category
                const logLevel = decision.category === 'network' ? LogLevel.INFO : LogLevel.DEBUG;
                if (currentLevel >= logLevel) {
                    if (logLevel === LogLevel.INFO) {
                        logger.info(message, hints);
                    } else {
                        logger.debug(message, hints);
                    }
                }
            }
        }
    };

const normalizeForHash = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeForHash(item));
    }

    if (value && typeof value === 'object') {
        const sortedEntries = Object.entries(value as Record<string, unknown>).sort(([leftKey], [rightKey]) =>
            leftKey.localeCompare(rightKey)
        );

        return sortedEntries.reduce<Record<string, unknown>>((accumulator, [key, nestedValue]) => {
            accumulator[key] = normalizeForHash(nestedValue);
            return accumulator;
        }, {});
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

type BudgetMetadata = {
    id: string;
    groupId?: string;
    [key: string]: unknown;
};

type BudgetDirectoryResolution = {
    directory: string;
    metadata: BudgetMetadata;
    metadataPath: string;
};

export class ActualApiTimeoutError extends Error {
    public constructor(operation: string, timeoutMs: number) {
        super(`Actual API operation '${operation}' timed out after ${timeoutMs}ms`);
        this.name = 'ActualApiTimeoutError';
    }
}

class ActualApi {
    protected isInitialized = false;
    private currentDataDir: string | null = null;

    public constructor(
        private readonly serverConfig: ActualServerConfig,
        private readonly logger: Logger
    ) {}

    private getRequestTimeoutMs(): number {
        const ms = this.serverConfig.requestTimeoutMs;
        if (typeof ms === 'number') {
            if (ms > 0) {
                const cappedMs = Math.min(ms, DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS);
                if (cappedMs !== ms) {
                    this.logger.warn(`requestTimeoutMs capped at ${DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS}ms`);
                }
                return cappedMs;
            }
            this.logger.warn(`requestTimeoutMs must be > 0; falling back to ${FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS}ms`);
            return FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS;
        }
        return FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS;
    }

    private createContextHints(additional?: string | string[]): string[] {
        const extras = Array.isArray(additional) ? additional : additional ? [additional] : [];

        return [`Server URL: ${this.serverConfig.serverUrl}`, ...extras];
    }

    private isNetworkError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }

        const { code, cause } = error as {
            code?: unknown;
            cause?: unknown;
        };

        const codeValue = typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;

        const knownCodes = new Set([
            'ECONNREFUSED',
            'ECONNRESET',
            'ENOTFOUND',
            'EHOSTUNREACH',
            'ETIMEDOUT',
            'EAI_AGAIN',
        ]);

        if (codeValue && knownCodes.has(codeValue.toUpperCase())) {
            return true;
        }

        const message =
            error instanceof Error
                ? error.message
                : typeof (error as { message?: unknown }).message === 'string'
                  ? String((error as { message?: unknown }).message)
                  : '';

        if (message && /(connect\s+)?ECONNREFUSED|ECONNRESET|network\s+timeout|fetch\s+failed/i.test(message)) {
            return true;
        }

        if (cause) {
            return this.isNetworkError(cause);
        }

        return false;
    }

    private isAuthenticationError(error: unknown): boolean {
        if (!error || typeof error !== 'object') {
            return false;
        }

        const message =
            error instanceof Error
                ? error.message
                : typeof (error as { message?: unknown }).message === 'string'
                  ? String((error as { message?: unknown }).message)
                  : '';

        if (/invalid\s+password|authentication\s+failed|unauthori[sz]ed/i.test(message)) {
            return true;
        }

        const details = error as {
            reason?: unknown;
            status?: unknown;
            response?: { status?: unknown };
            cause?: unknown;
        };

        const reason = typeof details.reason === 'string' ? details.reason : undefined;
        const status =
            typeof details.status === 'number'
                ? details.status
                : typeof details.status === 'string'
                  ? Number.parseInt(details.status, 10)
                  : undefined;
        const responseStatus = typeof details.response?.status === 'number' ? details.response.status : undefined;

        if ((reason && /invalid\s+password|auth/i.test(reason)) || status === 401 || responseStatus === 401) {
            return true;
        }

        if (details.cause) {
            return this.isAuthenticationError(details.cause);
        }

        return false;
    }

    private getFriendlyErrorMessage(operation: string, error: unknown): string | null {
        if (this.isNetworkError(error)) {
            return (
                'Unable to reach Actual server. ' +
                'Check your network connection and verify the Actual server is running.'
            );
        }

        if (this.isAuthenticationError(error)) {
            return (
                'Actual server rejected the provided password. ' +
                'Update the credentials in your configuration and try again.'
            );
        }

        if (!error || typeof error !== 'object') {
            return null;
        }

        if (!operation.startsWith('download budget')) {
            return null;
        }

        const details = error as {
            type?: unknown;
            reason?: unknown;
        };

        const reason = typeof details.reason === 'string' ? details.reason : '';

        if (
            details.type === 'PostError' &&
            /(^|[-\s])file[-\s]?not[-\s]?found$|group[-\s]?not[-\s]?found/i.test(reason)
        ) {
            return (
                'The Actual server could not find the requested budget file. ' +
                'Open the budget in Actual Desktop so it can re-upload the file before retrying.'
            );
        }

        return null;
    }

    private async runActualRequest<T>(
        operation: string,
        callback: () => Promise<T>,
        additionalHints?: string | string[],
        options?: { skipTimeoutShutdown?: boolean }
    ): Promise<T> {
        const timeoutMs = this.getRequestTimeoutMs();
        let timeoutHandle: NodeJS.Timeout | null = null;
        const hints = this.createContextHints(additionalHints);
        const unpatch = this.patchConsole();

        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
                const timeoutError = new ActualApiTimeoutError(operation, timeoutMs);
                const finalizeTimeout = () => {
                    this.isInitialized = false;
                    this.currentDataDir = null;
                    reject(timeoutError);
                };

                if (options?.skipTimeoutShutdown) {
                    finalizeTimeout();
                    return;
                }

                const extraHints = Array.isArray(additionalHints)
                    ? additionalHints
                    : additionalHints
                      ? [additionalHints]
                      : [];
                const fallbackHints = [...extraHints, `Timeout triggered by operation '${operation}'`];
                const warnHints = this.createContextHints(fallbackHints);
                const shutdownAttempt = this.runActualRequest(
                    'shutdown session',
                    () => actual.shutdown(),
                    fallbackHints,
                    { skipTimeoutShutdown: true }
                ).catch((shutdownError) => {
                    const reason = shutdownError instanceof Error ? shutdownError.message : String(shutdownError);
                    this.logger.warn(`Actual client shutdown after timeout failed: ${reason}`, warnHints);
                });

                Promise.race([
                    shutdownAttempt,
                    new Promise((resolve) => setTimeout(resolve, Math.min(5_000, timeoutMs / 3))),
                ]).finally(finalizeTimeout);
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
            const result = (await Promise.race([racingCallback, timeoutPromise])) as T;
            return result;
        } catch (error) {
            if (error instanceof ActualApiTimeoutError) {
                this.logger.error(error.message, hints);
                throw error;
            }

            const friendlyMessage = this.getFriendlyErrorMessage(operation, error);

            const message = friendlyMessage
                ? friendlyMessage
                : error instanceof Error
                  ? error.message
                  : 'Unknown error';

            const wrappedError =
                error instanceof Error
                    ? createErrorWithCause(`Actual API operation '${operation}' failed: ${message}`, error)
                    : new Error(`Actual API operation '${operation}' failed: ${message}`);
            this.logger.error(wrappedError.message, hints);
            throw wrappedError;
        } finally {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
            }
            unpatch();
        }
    }

    public async init(customDataDir?: string): Promise<void> {
        const actualDataDir = customDataDir ?? DEFAULT_DATA_DIR;

        const dataDirExists = await fs
            .access(actualDataDir)
            .then(() => true)
            .catch(() => false);

        if (!dataDirExists) {
            await fs.mkdir(actualDataDir, { recursive: true });
            this.logger.debug(`Created Actual data directory at ${actualDataDir}`);
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
        this.currentDataDir = actualDataDir;
    }

    public async ensureInitialization(customDataDir?: string): Promise<void> {
        const desiredDataDir = customDataDir ?? this.currentDataDir ?? DEFAULT_DATA_DIR;

        if (!this.isInitialized) {
            await this.init(desiredDataDir);
            return;
        }

        if (this.currentDataDir !== desiredDataDir) {
            this.logger.debug(
                `Reinitialising Actual data directory: ${this.currentDataDir ?? '(none)'} -> ${desiredDataDir}`
            );
            await this.shutdown();
            await this.init(desiredDataDir);
        }
    }

    public async sync(additionalHints?: string | string[]): Promise<void> {
        await this.ensureInitialization();
        await this.runActualRequest('sync budget', () => actual.sync(), additionalHints);
    }

    public async getAccounts(): ReturnType<typeof actual.getAccounts> {
        await this.ensureInitialization();
        return await this.runActualRequest('fetch accounts', () => actual.getAccounts());
    }

    public async loadBudget(budgetId: string): Promise<void> {
        const budgetConfig = this.serverConfig.budgets.find((b) => b.syncId === budgetId);

        if (!budgetConfig) {
            throw new Error(`No budget with syncId '${budgetId}' found.`);
        }

        const budgetHints = [`Budget sync ID: ${budgetConfig.syncId}`];
        const rootDataDir = this.currentDataDir ?? DEFAULT_DATA_DIR;
        const encryptionPassword =
            budgetConfig.e2eEncryption.enabled && budgetConfig.e2eEncryption.password
                ? { password: budgetConfig.e2eEncryption.password }
                : undefined;

        const maxAttempts = 2;
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const attemptHint = `Attempt ${attempt}/${maxAttempts}`;
            try {
                await this.ensureInitialization(rootDataDir);

                let downloadRootDir = this.currentDataDir ?? rootDataDir;

                const initialResolution = await this.tryResolveBudgetDirectory(budgetConfig.syncId, downloadRootDir);

                if (initialResolution) {
                    const resolvedRootDir = path.dirname(initialResolution.directory);
                    await this.ensureInitialization(resolvedRootDir);
                    downloadRootDir = this.currentDataDir ?? resolvedRootDir;
                }

                const downloadHints = [...budgetHints, `Data root: ${downloadRootDir}`, attemptHint];

                this.logger.debug(
                    `Downloading budget with syncId '${budgetConfig.syncId}' (attempt ${attempt}/${maxAttempts})...`
                );

                await this.runActualRequest(
                    `download budget '${budgetConfig.syncId}'`,
                    () => actual.downloadBudget(budgetConfig.syncId, encryptionPassword),
                    downloadHints
                );

                let resolvedBudget: BudgetDirectoryResolution;
                if (initialResolution) {
                    try {
                        const refreshedMetadata = await this.readBudgetMetadataByPath(initialResolution.metadataPath);
                        resolvedBudget = {
                            ...initialResolution,
                            metadata: refreshedMetadata,
                        };
                    } catch (_refreshError) {
                        resolvedBudget = await this.resolveBudgetDataDir(budgetConfig.syncId, downloadRootDir, {
                            logResolution: false,
                        });
                    }
                } else {
                    resolvedBudget = await this.resolveBudgetDataDir(budgetConfig.syncId, downloadRootDir, {
                        logResolution: false,
                    });
                }

                this.logResolvedBudgetDirectory(resolvedBudget, budgetConfig.syncId);

                const finalRootDir = path.dirname(resolvedBudget.directory);

                await this.ensureBudgetDirectoryAccessible(
                    resolvedBudget.directory,
                    resolvedBudget.metadata,
                    budgetConfig.syncId
                );

                await this.ensureInitialization(finalRootDir);

                const localBudgetId = resolvedBudget.metadata.id;
                const loadHints = [
                    ...budgetHints,
                    `Local budget ID: ${localBudgetId}`,
                    `Data root: ${finalRootDir}`,
                    attemptHint,
                ];

                this.logger.debug(
                    `Loading budget with syncId '${budgetConfig.syncId}' from local id '${localBudgetId}'...`
                );

                await this.runActualRequest(
                    `load budget '${budgetConfig.syncId}'`,
                    () => actual.loadBudget(localBudgetId),
                    loadHints
                );

                this.logger.debug(`Synchronizing budget with syncId '${budgetConfig.syncId}'...`);
                await this.sync([...budgetHints, attemptHint]);
                return;
            } catch (error) {
                lastError = error;

                if (attempt >= maxAttempts || !this.shouldRetryBudgetLoad(error)) {
                    throw error;
                }

                const retryHints: Array<string | Error> = [...this.createContextHints([...budgetHints, attemptHint])];
                if (error instanceof Error) {
                    retryHints.push(error);
                } else {
                    retryHints.push(String(error));
                }

                this.logger.warn(
                    `Budget load attempt ${attempt} failed (${this.getErrorSummary(error)}). Retrying...`,
                    retryHints
                );

                await this.shutdownSilently([...budgetHints, attemptHint]);
            }
        }

        if (lastError) {
            throw lastError;
        }
    }

    private async tryResolveBudgetDirectory(
        syncId: string,
        rootDir: string
    ): Promise<BudgetDirectoryResolution | null> {
        try {
            return await this.resolveBudgetDataDir(syncId, rootDir, {
                logResolution: false,
            });
        } catch (error) {
            if (this.shouldRetryBudgetLoad(error)) {
                return null;
            }

            if (error instanceof Error && error.message.includes('No Actual budget directory found')) {
                return null;
            }

            throw error;
        }
    }

    private async readBudgetMetadataByPath(metadataPath: string): Promise<BudgetMetadata> {
        const metadataRaw = await fs.readFile(metadataPath, 'utf8');
        const parsed = JSON.parse(metadataRaw);

        if (!parsed || typeof parsed !== 'object') {
            throw new Error(`Budget metadata at '${metadataPath}' is not an object`);
        }

        const record = parsed as Record<string, unknown>;
        const directoryName = path.basename(path.dirname(metadataPath));
        const idRaw = record.id;
        const id = typeof idRaw === 'string' && idRaw.trim().length > 0 ? idRaw.trim() : directoryName;
        const groupIdRaw = record.groupId;
        const groupId = typeof groupIdRaw === 'string' && groupIdRaw.trim().length > 0 ? groupIdRaw.trim() : undefined;

        const metadata: BudgetMetadata = {
            ...(record as BudgetMetadata),
            id,
        };

        if (groupId) {
            metadata.groupId = groupId;
        } else {
            delete metadata.groupId;
        }

        return metadata;
    }

    private async ensureBudgetDirectoryAccessible(
        directory: string,
        metadata: BudgetMetadata,
        syncId: string
    ): Promise<void> {
        try {
            await fs.access(directory);
        } catch (error) {
            throw createErrorWithCause(
                `Budget directory '${directory}' for syncId '${syncId}' is not accessible`,
                error instanceof Error ? error : new Error(String(error))
            );
        }

        if (!metadata.id || metadata.groupId !== syncId) {
            const observedGroup = metadata.groupId ?? '(missing)';
            const observedId = metadata.id ?? '(missing)';
            throw new Error(
                `Budget metadata mismatch: expected groupId '${syncId}', got '${observedGroup}' (id='${observedId}').`
            );
        }
    }

    private shouldRetryBudgetLoad(error: unknown): boolean {
        const lower = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
        if (!lower) {
            return false;
        }
        const retryPatterns = [
            'budget directory does not exist',
            'budget-not-found',
            'no actual budget directory found',
            'not accessible',
            'enoent',
            'eisdir',
        ];

        return retryPatterns.some((pattern) => lower.includes(pattern));
    }

    private getErrorSummary(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === 'string') {
            return error;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }

    private async shutdownSilently(contextHints: string[]): Promise<void> {
        try {
            await this.shutdown();
        } catch (error) {
            const hints: Array<string | Error> = [...this.createContextHints(contextHints)];
            if (error instanceof Error) {
                hints.push(error);
            } else {
                hints.push(String(error));
            }

            this.logger.warn('Failed to shutdown Actual client cleanly after budget load failure', hints);
        }
    }

    private isIgnorableShutdownError(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        const message = error.message;
        return error instanceof TypeError && message.includes("Cannot read properties of null (reading 'prepare')");
    }

    public async importTransactions(
        accountId: string,
        transactions: ImportTransaction[]
    ): ReturnType<typeof actual.importTransactions> {
        await this.ensureInitialization();
        const dedupedTransactions = this.normalizeAndDeduplicateTransactions(accountId, transactions);
        const importOptions = { defaultCleared: false };
        const removed = transactions.length - dedupedTransactions.length;
        if (removed > 0) {
            this.logger.debug(`Deduplicated ${removed} duplicate transactions before import`, [
                `Account ID: ${accountId}`,
            ]);
        }

        return await this.runActualRequest(
            `import transactions for account '${accountId}'`,
            () => actual.importTransactions(accountId, dedupedTransactions, importOptions),
            [`Account ID: ${accountId}`]
        );
    }

    private normalizeAndDeduplicateTransactions(
        accountId: string,
        transactions: ImportTransaction[]
    ): ImportTransaction[] {
        const dedupedTransactions: ImportTransaction[] = [];
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
        const rangeHint = endDate ? `Date range: ${startDate} – ${endDate}` : `Date range: ${startDate} onwards`;

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
            await this.runActualRequest('shutdown session', async () => {
                try {
                    await actual.shutdown();
                } catch (error) {
                    if (this.isIgnorableShutdownError(error)) {
                        const hints: Array<string | Error> = [
                            ...this.createContextHints('Operation: shutdown session'),
                        ];
                        if (error instanceof Error) {
                            hints.push(error);
                        } else {
                            hints.push(String(error));
                        }

                        this.logger.warn(
                            'Actual client shutdown completed despite a missing database connection',
                            hints
                        );
                        return;
                    }

                    throw error;
                }
            });
        } finally {
            this.isInitialized = false;
            this.currentDataDir = null;
        }
    }

    private static suppressDepth = 0;
    private static originals: {
        log: typeof console.log;
        info: typeof console.info;
        debug: typeof console.debug;
        warn: typeof console.warn;
    } | null = null;

    private ensureImportedId(accountId: string, transaction: ImportTransaction): ImportTransaction {
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

    private logResolvedBudgetDirectory(resolution: BudgetDirectoryResolution, syncId: string): void {
        const directoryName = path.basename(resolution.directory);
        const hints = [`Metadata path: ${resolution.metadataPath}`, `Local budget ID: ${resolution.metadata.id}`];

        this.logger.debug(`Using budget directory: ${directoryName} for syncId ${syncId}`, hints);
    }

    private async resolveBudgetDataDir(
        syncId: string,
        rootDir?: string,
        options?: { logResolution?: boolean }
    ): Promise<BudgetDirectoryResolution> {
        const { logResolution = true } = options ?? {};
        const actualDataDir = rootDir ?? this.currentDataDir ?? DEFAULT_DATA_DIR;

        let entries: Dirent[];
        try {
            entries = await fs.readdir(actualDataDir, { withFileTypes: true });
        } catch (error) {
            const maybeErrno = error as NodeJS.ErrnoException | undefined;
            if (maybeErrno?.code === 'ENOENT') {
                entries = [];
            } else {
                throw error;
            }
        }

        const inspectedDirs: string[] = [];
        const metadataDiagnostics: string[] = [];
        const MAX_DIRS_TO_SCAN = 100;

        const sortedEntries = entries
            .filter((entry) => entry.isDirectory())
            .sort((left, right) => left.name.localeCompare(right.name));

        if (sortedEntries.length > MAX_DIRS_TO_SCAN) {
            this.logger.warn(
                `Found ${sortedEntries.length} directories, scanning first ${MAX_DIRS_TO_SCAN} (omitting ${
                    sortedEntries.length - MAX_DIRS_TO_SCAN
                })`
            );
        }

        for (const entry of sortedEntries.slice(0, MAX_DIRS_TO_SCAN)) {
            inspectedDirs.push(entry.name);
            const metadataPath = path.join(actualDataDir, entry.name, 'metadata.json');

            try {
                const metadataRaw = await fs.readFile(metadataPath, 'utf8');
                const parsed = JSON.parse(metadataRaw);
                if (!parsed || typeof parsed !== 'object') {
                    metadataDiagnostics.push(`${entry.name}: metadata is not an object`);
                    continue;
                }

                const record = parsed as Record<string, unknown>;
                const groupIdRaw = record.groupId;
                const groupId = typeof groupIdRaw === 'string' ? groupIdRaw.trim() : '';
                if (!groupId) {
                    metadataDiagnostics.push(`${entry.name}: metadata missing groupId`);
                    continue;
                }

                if (groupId !== syncId) {
                    metadataDiagnostics.push(
                        `${entry.name}: metadata groupId '${groupId}' does not match requested syncId '${syncId}'`
                    );
                    continue;
                }

                const idRaw = record.id;
                const id = typeof idRaw === 'string' ? idRaw.trim() : entry.name;

                if (!id) {
                    metadataDiagnostics.push(`${entry.name}: metadata missing id`);
                    continue;
                }

                const resolvedDir = path.join(actualDataDir, entry.name);
                const metadata: BudgetMetadata = {
                    ...(record as BudgetMetadata),
                    id,
                    groupId,
                };
                const resolution: BudgetDirectoryResolution = {
                    directory: resolvedDir,
                    metadata,
                    metadataPath,
                };
                if (logResolution) {
                    this.logResolvedBudgetDirectory(resolution, syncId);
                }
                return resolution;
            } catch (error) {
                const maybeErrno = error as NodeJS.ErrnoException | undefined;
                if (maybeErrno?.code === 'ENOENT' || maybeErrno?.code === 'EISDIR') {
                    metadataDiagnostics.push(`${entry.name}: metadata.json not found`);
                    continue;
                }

                if (error instanceof SyntaxError) {
                    metadataDiagnostics.push(`${entry.name}: metadata.json could not be parsed`);
                    continue;
                }

                throw error;
            }
        }

        const inspectedSummary = inspectedDirs.length > 0 ? inspectedDirs.join(', ') : '(none)';
        const metadataSummary =
            metadataDiagnostics.length > 0 ? ` Metadata issues: ${metadataDiagnostics.join('; ')}.` : '';

        throw new Error(
            `No Actual budget directory found for syncId '${syncId}'. ` +
                `Checked directories under '${actualDataDir}': ${inspectedSummary}.` +
                metadataSummary +
                ' Open the budget in Actual Desktop and sync it before retrying.'
        );
    }

    private createFallbackImportedId(accountId: string, transaction: ImportTransaction): string {
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
            imported_payee: (transaction as { imported_payee?: string }).imported_payee ?? '',
            category: (transaction as { category?: string }).category ?? '',
            notes: transaction.notes ?? '',
            transfer_id: (transaction as { transfer_id?: string }).transfer_id ?? '',
            cleared: typeof transaction.cleared === 'boolean' ? String(transaction.cleared) : '',
            payee_id: payeeId,
            payee,
            subtransactions: normalizedSubtransactions,
        };

        const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

        return `mm-sync-${hash}`;
    }

    private patchConsole(): () => void {
        // Note: This temporarily monkey-patches the global console methods for the
        // entire process while an Actual request is in flight. Concurrent requests
        // share the suppression window, so unrelated log output may be filtered.
        // The Actual client may still emit logs outside this window (e.g. after a
        // timeout) because the SDK lacks granular logger hooks. In the future we
        // could scope suppression per logger if the SDK exposes suitable hooks.
        if (ActualApi.suppressDepth === 0) {
            ActualApi.originals = {
                log: console.log,
                info: console.info,
                debug: console.debug,
                warn: console.warn,
            };
            const originals = ActualApi.originals;
            // Enhanced console interception with granular control and performance optimization
            const consoleOptions = {
                minLevelForDebug: LogLevel.DEBUG,
                enableCategorization: true,
                categoryFilter: ['network', 'data', 'debug'], // Allow these categories
                enableCaching: true, // Enable performance caching
            };

            console.log = createConsoleInterceptor(
                this.logger,
                (...args: Parameters<typeof console.log>) => {
                    originals.log.apply(console, args);
                },
                consoleOptions
            );
            console.info = createConsoleInterceptor(
                this.logger,
                (...args: Parameters<typeof console.info>) => {
                    originals.info.apply(console, args);
                },
                consoleOptions
            );
            console.debug = createConsoleInterceptor(
                this.logger,
                (...args: Parameters<typeof console.debug>) => {
                    originals.debug.apply(console, args);
                },
                consoleOptions
            );
            console.warn = createConsoleInterceptor(
                this.logger,
                (...args: Parameters<typeof console.warn>) => {
                    originals.warn.apply(console, args);
                },
                consoleOptions
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
