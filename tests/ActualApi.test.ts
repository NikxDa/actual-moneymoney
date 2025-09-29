import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import { withFakeTimers } from './helpers/timers.js';
import { makeInvalidCredentialsError, makeNetworkDisconnectError } from './helpers/error-fixtures.js';

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

import type { ActualServerConfig } from '../src/utils/config.js';
import type Logger from '../src/utils/Logger.js';
import { LogLevel } from '../src/utils/Logger.js';
import { DEFAULT_DATA_DIR } from '../src/utils/shared.js';

const initMock = vi.fn();
const getAccountsMock = vi.fn();
const downloadBudgetMock = vi.fn();
const loadBudgetMock = vi.fn();
const importTransactionsMock = vi.fn();
const syncMock = vi.fn();
const getTransactionsMock = vi.fn();
const shutdownMock = vi.fn();

vi.mock('@actual-app/api', () => ({
    default: {
        init: initMock,
        internal: {
            send: vi.fn(),
        },
        getAccounts: getAccountsMock,
        downloadBudget: downloadBudgetMock,
        loadBudget: loadBudgetMock,
        importTransactions: importTransactionsMock,
        sync: syncMock,
        getTransactions: getTransactionsMock,
        shutdown: shutdownMock,
    },
}));

const accessMock = vi.fn();
const mkdirMock = vi.fn();
const readdirMock = vi.fn();
const readFileMock = vi.fn();

vi.mock('fs/promises', () => ({
    default: {
        access: accessMock,
        mkdir: mkdirMock,
        readdir: readdirMock,
        readFile: readFileMock,
    },
}));

const createLogger = () =>
    ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLevel: () => LogLevel.INFO,
    }) as unknown as Logger;

const createDirent = (name: string, { isDirectory = true }: { isDirectory?: boolean } = {}): Dirent =>
    ({
        name,
        isDirectory: () => isDirectory,
        isFile: () => !isDirectory,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSymbolicLink: () => false,
        isSocket: () => false,
    }) as unknown as Dirent;

const makeServerConfig = (syncId: string, overrides: Partial<ActualServerConfig> = {}): ActualServerConfig => {
    const base: ActualServerConfig = {
        serverUrl: 'http://localhost:5006',
        serverPassword: 'secret',
        requestTimeoutMs: 45000,
        budgets: [
            {
                syncId,
                e2eEncryption: {
                    enabled: false,
                    password: undefined,
                },
                accountMapping: {},
            },
        ],
    };

    return {
        ...base,
        ...overrides,
        budgets: overrides.budgets ?? base.budgets,
    };
};

describe('ActualApi', () => {
    beforeEach(() => {
        initMock.mockReset();
        getAccountsMock.mockReset();
        downloadBudgetMock.mockReset();
        loadBudgetMock.mockReset();
        importTransactionsMock.mockReset();
        syncMock.mockReset();
        getTransactionsMock.mockReset();
        shutdownMock.mockReset();
        shutdownMock.mockResolvedValue(undefined);
        initMock.mockResolvedValue(undefined);
        accessMock.mockReset();
        mkdirMock.mockReset();
        readdirMock.mockReset();
        readFileMock.mockReset();
        accessMock.mockResolvedValue(undefined);
        mkdirMock.mockResolvedValue(undefined);
        readdirMock.mockResolvedValue([]);
        readFileMock.mockRejectedValue(new Error('missing metadata'));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('passes bounded date ranges to the Actual API and restores console state', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 45000,
            budgets: [
                {
                    syncId: 'budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const logger = createLogger();
        const api = new ActualApi(serverConfig, logger);
        await api.init();

        const logSpy = vi.spyOn(console, 'log');
        getTransactionsMock.mockImplementation(async () => {
            console.log('Got messages from server abc');
            return [];
        });

        const start = new Date('2024-02-01T00:00:00Z');
        const end = new Date('2024-02-20T00:00:00Z');

        await api.getTransactions('account-1', { from: start, to: end });

        expect(getTransactionsMock).toHaveBeenCalledWith('account-1', '2024-02-01', '2024-02-20');
        expect(console.log).toBe(logSpy);
        expect(logSpy.mock.calls.some((args) => String(args[0]).includes('Got messages from server'))).toBe(false);

        logSpy.mockRestore();
    });

    it('wraps network disconnects with actionable guidance', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget'), logger);

        initMock.mockRejectedValue(makeNetworkDisconnectError());

        const guidance =
            'Unable to reach Actual server. Check your network connection and verify the Actual server is running.';

        await expect(api.init()).rejects.toThrow(guidance);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining(guidance),
            expect.arrayContaining(['Server URL: http://localhost:5006'])
        );
    });

    it('surfaces credential failures with guidance on updating configuration', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget'), logger);

        initMock.mockRejectedValue(makeInvalidCredentialsError());

        await expect(api.init()).rejects.toThrow(/rejected the provided password/);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('rejected the provided password'),
            expect.arrayContaining(['Server URL: http://localhost:5006'])
        );
    });

    it('downloads, loads, and synchronises the requested budget', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 45000,
            budgets: [
                {
                    syncId: 'budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const logger = createLogger();
        const api = new ActualApi(serverConfig, logger);

        readdirMock.mockResolvedValue([createDirent('budget-dir'), createDirent('other')]);
        readFileMock.mockImplementation(async (filePath: string) => {
            if (filePath === path.join(DEFAULT_DATA_DIR, 'budget-dir', 'metadata.json')) {
                return JSON.stringify({
                    id: 'local-budget-id',
                    groupId: 'budget',
                });
            }

            return JSON.stringify({
                id: 'other-budget',
                groupId: 'other-budget',
            });
        });

        initMock.mockResolvedValue(undefined);
        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await api.loadBudget('budget');

        expect(downloadBudgetMock).toHaveBeenCalledWith('budget', undefined);
        expect(loadBudgetMock).toHaveBeenCalledWith('local-budget-id');
        expect(syncMock).toHaveBeenCalled();
        expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ dataDir: DEFAULT_DATA_DIR }));
        expect(initMock).toHaveBeenCalledTimes(1);
        expect(downloadBudgetMock.mock.invocationCallOrder[0]).toBeLessThan(loadBudgetMock.mock.invocationCallOrder[0]);
        expect(loadBudgetMock.mock.invocationCallOrder[0]).toBeLessThan(syncMock.mock.invocationCallOrder[0]);
        expect(logger.debug).toHaveBeenCalledWith(
            'Using budget directory: budget-dir for syncId budget',
            expect.arrayContaining([
                `Metadata path: ${path.join(DEFAULT_DATA_DIR, 'budget-dir', 'metadata.json')}`,
                'Local budget ID: local-budget-id',
            ])
        );
    });

    it('surfaces a helpful error when the server no longer has the budget file', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget'), logger);

        readdirMock.mockResolvedValue([createDirent('budget-dir')]);
        readFileMock.mockImplementation(async (filePath: string) => {
            if (filePath === path.join(DEFAULT_DATA_DIR, 'budget-dir', 'metadata.json')) {
                return JSON.stringify({ id: 'budget-dir', groupId: 'budget' });
            }

            throw new Error('Unexpected file path');
        });

        const postError = Object.assign(new Error('PostError: file not found'), {
            type: 'PostError',
            reason: 'file not found',
        });

        downloadBudgetMock.mockRejectedValue(postError);

        await expect(api.loadBudget('budget')).rejects.toThrow(
            /Actual server could not find the requested budget file/
        );
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Actual server could not find the requested budget file'),
            expect.arrayContaining([
                'Server URL: http://localhost:5006',
                'Budget sync ID: budget',
                `Data root: ${DEFAULT_DATA_DIR}`,
            ])
        );
        expect(loadBudgetMock).not.toHaveBeenCalled();
    });

    it('treats group-not-found errors as friendly download failures', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget'), logger);

        readdirMock.mockResolvedValue([createDirent('budget-dir')]);
        readFileMock.mockResolvedValue(JSON.stringify({ id: 'budget-dir', groupId: 'budget' }));

        const postError = Object.assign(new Error('PostError: group-not-found'), {
            type: 'PostError',
            reason: 'group-not-found',
        });

        downloadBudgetMock.mockRejectedValue(postError);

        await expect(api.loadBudget('budget')).rejects.toThrow(
            /Actual server could not find the requested budget file/
        );
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Actual server could not find the requested budget file'),
            expect.arrayContaining([
                'Server URL: http://localhost:5006',
                'Budget sync ID: budget',
                `Data root: ${DEFAULT_DATA_DIR}`,
            ])
        );
        expect(loadBudgetMock).not.toHaveBeenCalled();
    });

    it('retries budget loading when Actual cannot find the local directory', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const warnSpy = vi.spyOn(logger, 'warn');
        const api = new ActualApi(makeServerConfig('budget'), logger);

        readdirMock.mockResolvedValue([createDirent('budget-dir')]);
        readFileMock.mockResolvedValue(JSON.stringify({ id: 'local-budget-id', groupId: 'budget' }));

        const missingDirError = new Error('budget directory does not exist');
        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockRejectedValueOnce(missingDirError).mockResolvedValueOnce(undefined);
        syncMock.mockResolvedValue(undefined);

        await expect(api.loadBudget('budget')).resolves.toBeUndefined();

        expect(downloadBudgetMock).toHaveBeenCalledTimes(2);
        expect(loadBudgetMock).toHaveBeenCalledTimes(2);
        expect(loadBudgetMock).toHaveBeenLastCalledWith('local-budget-id');
        expect(downloadBudgetMock.mock.invocationCallOrder[0]).toBeLessThan(loadBudgetMock.mock.invocationCallOrder[0]);
        expect(downloadBudgetMock.mock.invocationCallOrder[1]).toBeLessThan(loadBudgetMock.mock.invocationCallOrder[1]);
        const warnCall = warnSpy.mock.calls.find(([message]) =>
            String(message).includes('Budget load attempt 1 failed')
        );
        expect(warnCall).toBeDefined();
        const [, warnHints] = warnCall!;
        expect(warnHints).toEqual(
            expect.arrayContaining([
                'Server URL: http://localhost:5006',
                'Budget sync ID: budget',
                'Attempt 1/2',
                expect.any(Error),
            ])
        );
    });

    it('surfaces timeout errors from Actual API calls', async () => {
        const { default: ActualApi, ActualApiTimeoutError } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget', { requestTimeoutMs: 5 }), logger);
        readdirMock.mockResolvedValue([createDirent('budget-dir')]);
        readFileMock.mockResolvedValue(JSON.stringify({ id: 'budget-dir', groupId: 'budget' }));

        downloadBudgetMock.mockImplementationOnce(() => new Promise(() => undefined));
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await withFakeTimers(async () => {
            const loadPromise = api.loadBudget('budget');
            const capturedError = loadPromise.catch((error) => error);

            await vi.advanceTimersByTimeAsync(10);
            const timeoutError = await capturedError;
            expect(timeoutError).toBeInstanceOf(ActualApiTimeoutError);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('timed out'),
                expect.arrayContaining(['Server URL: http://localhost:5006', 'Budget sync ID: budget'])
            );
            expect(loadBudgetMock).not.toHaveBeenCalled();
            expect(shutdownMock).toHaveBeenCalledTimes(1);
            expect(initMock).toHaveBeenCalledTimes(1);
        });

        downloadBudgetMock.mockReset();
        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockReset();
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockReset();
        syncMock.mockResolvedValue(undefined);
        initMock.mockClear();
        shutdownMock.mockClear();

        await api.loadBudget('budget');

        expect(initMock).toHaveBeenCalledTimes(1);
        expect(shutdownMock).not.toHaveBeenCalled();
    });

    it('caps shutdown duration when timeout-triggered shutdown hangs', async () => {
        const { default: ActualApi, ActualApiTimeoutError } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget', { requestTimeoutMs: 6 }), logger);
        readdirMock.mockResolvedValue([createDirent('budget-dir')]);
        readFileMock.mockResolvedValue(JSON.stringify({ id: 'budget-dir', groupId: 'budget' }));

        downloadBudgetMock.mockImplementationOnce(() => new Promise(() => undefined));
        shutdownMock.mockImplementationOnce(() => new Promise(() => undefined));
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await withFakeTimers(async () => {
            const loadPromise = api.loadBudget('budget');
            const capturedError = loadPromise.catch((error) => error);

            await vi.advanceTimersByTimeAsync(10);
            const timeoutError = await capturedError;
            expect(timeoutError).toBeInstanceOf(ActualApiTimeoutError);
            expect(shutdownMock).toHaveBeenCalledTimes(1);
        });
    });

    it('populates imported ids and deduplicates transactions before import', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 45000,
            budgets: [
                {
                    syncId: 'budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const api = new ActualApi(serverConfig, createLogger());
        await api.init();

        const transactions: ImportTransaction[] = [
            {
                date: '2024-02-01',
                amount: 100,
                imported_id: 'existing',
                imported_payee: 'Alpha',
                notes: 'first',
            },
            {
                date: '2024-02-02',
                amount: 200,
                imported_id: 'existing',
                imported_payee: 'Beta',
                notes: 'second duplicate should be dropped',
            },
            {
                date: '2024-02-03',
                amount: 300,
                imported_payee: 'Gamma',
                notes: 'needs id',
            },
            {
                date: '2024-02-03',
                amount: 300,
                imported_payee: 'Gamma',
                notes: 'needs id',
            },
        ];

        importTransactionsMock.mockResolvedValue({
            added: [],
            updated: [],
        });

        await api.importTransactions('account-1', transactions);

        expect(importTransactionsMock).toHaveBeenCalledTimes(1);
        const [, sentTransactions] = importTransactionsMock.mock.calls[0];

        expect(sentTransactions).toHaveLength(2);
        expect(sentTransactions[0].imported_id).toBe('existing');
        expect(sentTransactions[1].imported_id).toMatch(/^mm-sync-/);
        expect(new Set(sentTransactions.map((tx) => tx.imported_id)).size).toBe(sentTransactions.length);
    });

    it('retries timed out imports without creating duplicate transactions', async () => {
        vi.useFakeTimers();

        let resolveFirstAttempt: (() => void) | null = null;

        const { default: ActualApi, ActualApiTimeoutError } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 5,
            budgets: [
                {
                    syncId: 'budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const logger = createLogger();
        const api = new ActualApi(serverConfig, logger);
        await api.init();

        const transactions: ImportTransaction[] = [
            {
                date: '2024-02-01',
                amount: 100,
                imported_id: 'existing',
                imported_payee: 'Alpha',
                notes: 'first',
            },
            {
                date: '2024-02-03',
                amount: 300,
                imported_payee: 'Gamma',
                notes: 'needs id',
            },
        ];

        const serverRecords = new Map<string, ImportTransaction>();
        const callPayloads: string[][] = [];

        importTransactionsMock.mockImplementation((accountId, txns) => {
            expect(accountId).toBe('account-1');
            const ids = txns.map((tx) => tx.imported_id ?? '');
            callPayloads.push(ids);
            expect(new Set(ids).size).toBe(ids.length);

            const newTransactions = txns.filter((tx) => {
                const importedId = tx.imported_id;
                expect(importedId).toBeTruthy();
                return importedId ? !serverRecords.has(importedId) : false;
            });

            const finalize = () => {
                for (const tx of newTransactions) {
                    serverRecords.set(tx.imported_id as string, tx);
                }
            };

            if (!resolveFirstAttempt) {
                return new Promise((resolve) => {
                    resolveFirstAttempt = () => {
                        finalize();
                        resolve({ added: newTransactions, updated: [] });
                    };
                });
            }

            finalize();
            return Promise.resolve({ added: newTransactions, updated: [] });
        });

        const firstAttempt = api.importTransactions('account-1', transactions);
        const firstAttemptError = firstAttempt.catch((error) => error);

        await vi.advanceTimersByTimeAsync(10);

        const timeoutError = await firstAttemptError;
        expect(timeoutError).toBeInstanceOf(ActualApiTimeoutError);
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('timed out'),
            expect.arrayContaining(['Server URL: http://localhost:5006', 'Account ID: account-1'])
        );

        expect(resolveFirstAttempt).toBeTruthy();
        resolveFirstAttempt!();
        await Promise.resolve();

        const secondAttempt = api.importTransactions('account-1', transactions);
        const result = await secondAttempt;
        expect(result).toBeDefined();

        expect(callPayloads).toHaveLength(2);
        expect(callPayloads[0]).toEqual(callPayloads[1]);
        expect(importTransactionsMock).toHaveBeenCalledTimes(2);
        const secondPayloadIds = callPayloads[1];
        expect(new Set(secondPayloadIds).size).toBe(secondPayloadIds.length);
        expect(serverRecords.size).toBe(2);
    });

    it('ignores shutdown when the API was never initialised', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 45000,
            budgets: [
                {
                    syncId: 'budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const api = new ActualApi(serverConfig, createLogger());
        await api.shutdown();

        expect(shutdownMock).not.toHaveBeenCalled();
    });

    it('logs and suppresses benign shutdown errors when the database connection is missing', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget'), logger);

        await api.init();

        const shutdownError = new TypeError("Cannot read properties of null (reading 'prepare')");
        shutdownMock.mockRejectedValueOnce(shutdownError);

        await expect(api.shutdown()).resolves.toBeUndefined();

        expect(shutdownMock).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('missing database connection'),
            expect.arrayContaining([
                'Server URL: http://localhost:5006',
                'Operation: shutdown session',
                expect.any(Error),
            ])
        );
    });

    it('derives the budget directory from metadata before initialisation', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 45000,
            budgets: [
                {
                    syncId: 'target-budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const api = new ActualApi(serverConfig, createLogger());

        readdirMock.mockResolvedValue([createDirent('alpha'), createDirent('target-directory'), createDirent('beta')]);
        readFileMock.mockImplementation(async (filePath: string) => {
            if (filePath === path.join(DEFAULT_DATA_DIR, 'target-directory', 'metadata.json')) {
                return JSON.stringify({
                    id: 'target-directory',
                    groupId: 'target-budget',
                });
            }

            return JSON.stringify({
                id: 'other-budget',
                groupId: 'other-budget',
            });
        });

        initMock.mockResolvedValue(undefined);
        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await api.loadBudget('target-budget');

        expect(initMock).toHaveBeenCalledTimes(1);
        expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ dataDir: DEFAULT_DATA_DIR }));
        expect(downloadBudgetMock).toHaveBeenCalled();
    });

    it('skips corrupt metadata entries while resolving the budget directory', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget'), logger);

        readdirMock.mockResolvedValue([createDirent('corrupt'), createDirent('non-object'), createDirent('valid')]);
        readFileMock.mockImplementation(async (filePath: string) => {
            if (filePath === path.join(DEFAULT_DATA_DIR, 'corrupt', 'metadata.json')) {
                throw new SyntaxError('Unexpected token');
            }
            if (filePath === path.join(DEFAULT_DATA_DIR, 'non-object', 'metadata.json')) {
                return '"unexpected"';
            }
            if (filePath === path.join(DEFAULT_DATA_DIR, 'valid', 'metadata.json')) {
                return JSON.stringify({ id: 'valid', groupId: 'budget' });
            }
            throw new Error(`unexpected file ${filePath}`);
        });
        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await expect(api.loadBudget('budget')).resolves.toBeUndefined();

        expect(logger.debug).toHaveBeenCalledWith(
            'Using budget directory: valid for syncId budget',
            expect.arrayContaining([
                `Metadata path: ${path.join(DEFAULT_DATA_DIR, 'valid', 'metadata.json')}`,
                'Local budget ID: valid',
            ])
        );
    });

    it('throws a helpful error when no metadata matches the requested budget', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 45000,
            budgets: [
                {
                    syncId: 'missing-budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const api = new ActualApi(serverConfig, createLogger());

        const nonMatchingMetadata = JSON.stringify({
            id: 'alpha',
            groupId: 'different-budget',
        });

        readdirMock.mockResolvedValue([createDirent('alpha'), createDirent('beta')]);
        readFileMock.mockResolvedValue(nonMatchingMetadata);
        downloadBudgetMock.mockResolvedValue(undefined);

        const escapedRoot = DEFAULT_DATA_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        await expect(api.loadBudget('missing-budget')).rejects.toThrow(
            new RegExp(
                `No Actual budget directory found for syncId 'missing-budget'\\. ` +
                    `Checked directories under '${escapedRoot}': alpha, beta\\. Metadata issues: ` +
                    `.*groupId 'different-budget' does not match requested syncId 'missing-budget'.*` +
                    ' Open the budget in Actual Desktop and sync it before retrying\\.'
            )
        );
        expect(downloadBudgetMock).toHaveBeenCalledTimes(2);
        expect(readdirMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('warns when scanning large Actual data directories', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const api = new ActualApi(makeServerConfig('budget'), logger);

        const targetDirectory = 'dir-050';
        const directories = Array.from({ length: 105 }, (_, index) =>
            createDirent(`dir-${index.toString().padStart(3, '0')}`)
        );

        readdirMock.mockResolvedValue(directories);
        readFileMock.mockImplementation(async (filePath: string) => {
            const directoryName = path.basename(path.dirname(filePath));
            if (directoryName === targetDirectory) {
                return JSON.stringify({ id: 'dir-first', groupId: 'budget' });
            }

            return JSON.stringify({
                id: 'dir-other',
                groupId: 'other-budget',
            });
        });

        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await api.loadBudget('budget');

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('scanning first 100 (omitting 5)'));
        expect(downloadBudgetMock).toHaveBeenCalled();
        expect(loadBudgetMock).toHaveBeenCalled();
    });

    it('resets initialization state after a manual shutdown', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 45000,
            budgets: [
                {
                    syncId: 'budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const api = new ActualApi(serverConfig, createLogger());

        readdirMock.mockResolvedValue([createDirent('budget-dir')]);
        readFileMock.mockResolvedValue(JSON.stringify({ id: 'budget-dir', groupId: 'budget' }));
        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await api.loadBudget('budget');
        initMock.mockClear();
        await api.shutdown();

        await api.loadBudget('budget');

        expect(initMock).toHaveBeenCalledTimes(1);
        const [[initArgs]] = initMock.mock.calls;
        expect(initArgs.dataDir).toBe(DEFAULT_DATA_DIR);
        expect(shutdownMock).toHaveBeenCalledTimes(1);
    });

    it('retries loading a budget after a failure without duplicating resolution logs', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const debugSpy = vi.spyOn(logger, 'debug');
        const serverConfig = makeServerConfig('retry-budget');
        const api = new ActualApi(serverConfig, logger);

        const directoryName = 'retry-budget-dir';
        const metadataPath = path.join(DEFAULT_DATA_DIR, directoryName, 'metadata.json');

        readdirMock.mockResolvedValue([createDirent(directoryName)]);
        readFileMock.mockImplementation(async (filePath: string) => {
            if (filePath === metadataPath) {
                return JSON.stringify({
                    id: directoryName,
                    groupId: 'retry-budget',
                });
            }

            throw new Error(`Unexpected read for ${filePath}`);
        });

        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock
            .mockRejectedValueOnce(new Error('budget directory does not exist'))
            .mockResolvedValueOnce(undefined);
        syncMock.mockResolvedValue(undefined);

        await expect(api.loadBudget('retry-budget')).resolves.toBeUndefined();

        expect(downloadBudgetMock).toHaveBeenCalledTimes(2);
        expect(loadBudgetMock).toHaveBeenCalledTimes(2);
        expect(shutdownMock).toHaveBeenCalledTimes(1);

        const [firstLoadOrder, secondLoadOrder] = loadBudgetMock.mock.invocationCallOrder;
        const [shutdownOrder] = shutdownMock.mock.invocationCallOrder;
        expect(firstLoadOrder).toBeLessThan(shutdownOrder);
        expect(shutdownOrder).toBeLessThan(secondLoadOrder);

        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Budget load attempt 1 failed'),
            expect.arrayContaining([
                `Server URL: ${serverConfig.serverUrl}`,
                'Budget sync ID: retry-budget',
                'Attempt 1/2',
                expect.any(Error),
            ])
        );

        const debugMessages = debugSpy.mock.calls.map((call) => call[0]);
        const firstDownloadIndex = debugMessages.findIndex(
            (message) =>
                typeof message === 'string' &&
                message.includes("Downloading budget with syncId 'retry-budget' (attempt 1/2)")
        );
        const secondDownloadIndex = debugMessages.findIndex(
            (message) =>
                typeof message === 'string' &&
                message.includes("Downloading budget with syncId 'retry-budget' (attempt 2/2)")
        );
        const directoryLogIndexes = debugSpy.mock.calls
            .map((call, index) => ({ index, message: call[0], hints: call[1] }))
            .filter(({ message }) => typeof message === 'string' && message.startsWith('Using budget directory:'))
            .map(({ index, hints }) => {
                expect(hints).toEqual([`Metadata path: ${metadataPath}`, `Local budget ID: ${directoryName}`]);
                return index;
            });

        expect(directoryLogIndexes).toHaveLength(2);
        expect(firstDownloadIndex).toBeGreaterThanOrEqual(0);
        expect(secondDownloadIndex).toBeGreaterThan(firstDownloadIndex);
        expect(directoryLogIndexes[0]).toBeGreaterThan(firstDownloadIndex);
        expect(directoryLogIndexes[1]).toBeGreaterThan(secondDownloadIndex);
    });

    it('refreshes metadata after downloading a budget before loading it', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const logger = createLogger();
        const debugSpy = vi.spyOn(logger, 'debug');
        const serverConfig = makeServerConfig('rotating-id');
        const api = new ActualApi(serverConfig, logger);

        const directoryName = 'rotating-budget-dir';
        const metadataPath = path.join(DEFAULT_DATA_DIR, directoryName, 'metadata.json');

        readdirMock.mockResolvedValue([createDirent(directoryName)]);

        let readCount = 0;
        readFileMock.mockImplementation(async (filePath: string) => {
            if (filePath !== metadataPath) {
                throw new Error(`Unexpected metadata path ${filePath}`);
            }

            readCount += 1;
            if (readCount === 1) {
                return JSON.stringify({
                    id: 'stale-id',
                    groupId: 'rotating-id',
                });
            }

            return JSON.stringify({
                id: 'fresh-id',
                groupId: 'rotating-id',
            });
        });

        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await expect(api.loadBudget('rotating-id')).resolves.toBeUndefined();

        expect(downloadBudgetMock).toHaveBeenCalledTimes(1);
        expect(readFileMock).toHaveBeenCalledTimes(2);
        expect(loadBudgetMock).toHaveBeenCalledTimes(1);
        expect(loadBudgetMock).toHaveBeenCalledWith('fresh-id');

        const directoryLogs = debugSpy.mock.calls.filter(
            ([message]) => typeof message === 'string' && message.startsWith('Using budget directory:')
        );
        expect(directoryLogs).toHaveLength(1);
        expect(directoryLogs[0][1]).toEqual([`Metadata path: ${metadataPath}`, 'Local budget ID: fresh-id']);

        const loadLogs = debugSpy.mock.calls.filter(
            ([message]) =>
                typeof message === 'string' &&
                message.startsWith("Loading budget with syncId 'rotating-id' from local id")
        );
        expect(loadLogs).toHaveLength(1);
        expect(loadLogs[0][0]).toContain("local id 'fresh-id'");
    });

    it('passes the e2e encryption password through to the download request', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const password = 'budget-secret';
        const api = new ActualApi(
            makeServerConfig('budget', {
                budgets: [
                    {
                        syncId: 'budget',
                        e2eEncryption: {
                            enabled: true,
                            password,
                        },
                        accountMapping: {},
                    },
                ],
            }),
            createLogger()
        );

        readdirMock.mockResolvedValue([createDirent('budget-dir')]);
        readFileMock.mockResolvedValue(JSON.stringify({ id: 'budget-dir', groupId: 'budget' }));
        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await api.loadBudget('budget');

        expect(downloadBudgetMock).toHaveBeenCalledTimes(1);
        expect(downloadBudgetMock).toHaveBeenCalledWith('budget', {
            password,
        });
    });

    it('switches Actual data directories when loading different budgets', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
            requestTimeoutMs: 45000,
            budgets: [
                {
                    syncId: 'first-budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
                {
                    syncId: 'second-budget',
                    e2eEncryption: {
                        enabled: false,
                        password: undefined,
                    },
                    accountMapping: {},
                },
            ],
        };

        const logger = createLogger();
        const api = new ActualApi(serverConfig, logger);

        readdirMock.mockResolvedValue([createDirent('dir-first'), createDirent('dir-second')]);
        readFileMock.mockImplementation(async (filePath: string) => {
            if (filePath === path.join(DEFAULT_DATA_DIR, 'dir-first', 'metadata.json')) {
                return JSON.stringify({
                    id: 'first-local-id',
                    groupId: 'first-budget',
                });
            }
            if (filePath === path.join(DEFAULT_DATA_DIR, 'dir-second', 'metadata.json')) {
                return JSON.stringify({
                    id: 'second-local-id',
                    groupId: 'second-budget',
                });
            }
            throw new Error('unexpected file');
        });

        initMock.mockResolvedValue(undefined);
        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await api.loadBudget('first-budget');
        await api.loadBudget('second-budget');

        expect(logger.debug).toHaveBeenCalledWith(
            'Using budget directory: dir-first for syncId first-budget',
            expect.arrayContaining([
                `Metadata path: ${path.join(DEFAULT_DATA_DIR, 'dir-first', 'metadata.json')}`,
                'Local budget ID: first-local-id',
            ])
        );
        expect(logger.debug).toHaveBeenCalledWith(
            'Using budget directory: dir-second for syncId second-budget',
            expect.arrayContaining([
                `Metadata path: ${path.join(DEFAULT_DATA_DIR, 'dir-second', 'metadata.json')}`,
                'Local budget ID: second-local-id',
            ])
        );

        expect(initMock).toHaveBeenCalledTimes(1);
        const [[singleInitArgs]] = initMock.mock.calls;
        expect(singleInitArgs.dataDir).toBe(DEFAULT_DATA_DIR);
        expect(shutdownMock).not.toHaveBeenCalled();
    });
});
