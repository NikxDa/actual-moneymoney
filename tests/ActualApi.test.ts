import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { CreateTransaction } from '@actual-app/api';

import type { ActualServerConfig } from '../src/utils/config.js';
import type Logger from '../src/utils/Logger.js';
import { LogLevel } from '../src/utils/Logger.js';

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

const createLogger = () =>
    ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLevel: () => LogLevel.INFO,
    }) as unknown as Logger;

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
    });

    it('passes bounded date ranges to the Actual API and restores console state', async () => {
        const { default: ActualApi } = await import(
            '../src/utils/ActualApi.js'
        );

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
        // Mark as initialized to avoid touching the filesystem in tests
        // @ts-expect-error accessing protected test hook
        api.isInitialized = true;

        const logSpy = vi.spyOn(console, 'log');
        getTransactionsMock.mockImplementation(async () => {
            console.log('Got messages from server abc');
            return [];
        });

        const start = new Date('2024-02-01T00:00:00Z');
        const end = new Date('2024-02-20T00:00:00Z');

        await api.getTransactions('account-1', { from: start, to: end });

        expect(getTransactionsMock).toHaveBeenCalledWith(
            'account-1',
            '2024-02-01',
            '2024-02-20'
        );
        expect(console.log).toBe(logSpy);
        expect(
            logSpy.mock.calls.some((args) =>
                String(args[0]).includes('Got messages from server')
            )
        ).toBe(false);

        logSpy.mockRestore();
    });

    it('downloads, loads, and synchronises the requested budget', async () => {
        const { default: ActualApi } = await import(
            '../src/utils/ActualApi.js'
        );

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
        // @ts-expect-error accessing protected test hook
        api.isInitialized = true;

        downloadBudgetMock.mockResolvedValue(undefined);
        loadBudgetMock.mockResolvedValue(undefined);
        syncMock.mockResolvedValue(undefined);

        await api.loadBudget('budget');

        expect(downloadBudgetMock).toHaveBeenCalledWith('budget', undefined);
        expect(loadBudgetMock).toHaveBeenCalledWith('budget');
        expect(syncMock).toHaveBeenCalled();
        expect(downloadBudgetMock.mock.invocationCallOrder[0]).toBeLessThan(
            loadBudgetMock.mock.invocationCallOrder[0]
        );
        expect(loadBudgetMock.mock.invocationCallOrder[0]).toBeLessThan(
            syncMock.mock.invocationCallOrder[0]
        );
    });

    it('surfaces timeout errors from Actual API calls', async () => {
        vi.useFakeTimers();

        try {
            const { default: ActualApi, ActualApiTimeoutError } = await import(
                '../src/utils/ActualApi.js'
            );

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
            // @ts-expect-error accessing protected test hook
            api.isInitialized = true;

            downloadBudgetMock.mockImplementation(
                () => new Promise(() => undefined)
            );

            const loadPromise = api.loadBudget('budget');
            const capturedError = loadPromise.catch((error) => error);

            await vi.advanceTimersByTimeAsync(10);
            const timeoutError = await capturedError;
            expect(timeoutError).toBeInstanceOf(ActualApiTimeoutError);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('timed out'),
                expect.arrayContaining([
                    'Server URL: http://localhost:5006',
                    'Budget sync ID: budget',
                ])
            );
            expect(loadBudgetMock).not.toHaveBeenCalled();
        } finally {
            // Ensure no timers remain and restore timers
            try {
                await vi.runOnlyPendingTimersAsync();
                vi.clearAllTimers();
            } finally {
                vi.useRealTimers();
            }
        }
    });

    it('populates imported ids and deduplicates transactions before import', async () => {
        const { default: ActualApi } = await import(
            '../src/utils/ActualApi.js'
        );

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
        // @ts-expect-error accessing protected test hook
        api.isInitialized = true;

        const transactions: CreateTransaction[] = [
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
        expect(new Set(sentTransactions.map((tx) => tx.imported_id)).size).toBe(
            sentTransactions.length
        );
    });

    it('retries timed out imports without creating duplicate transactions', async () => {
        vi.useFakeTimers();

        let resolveFirstAttempt: (() => void) | null = null;

        try {
            const { default: ActualApi, ActualApiTimeoutError } = await import(
                '../src/utils/ActualApi.js'
            );

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
            // @ts-expect-error accessing protected test hook
            api.isInitialized = true;

            const transactions: CreateTransaction[] = [
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

            const serverRecords = new Map<string, CreateTransaction>();
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

            const firstAttempt = api.importTransactions(
                'account-1',
                transactions
            );
            const firstAttemptError = firstAttempt.catch((error) => error);

            await vi.advanceTimersByTimeAsync(10);

            const timeoutError = await firstAttemptError;
            expect(timeoutError).toBeInstanceOf(ActualApiTimeoutError);
            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining('timed out'),
                expect.arrayContaining([
                    'Server URL: http://localhost:5006',
                    'Account ID: account-1',
                ])
            );

            expect(resolveFirstAttempt).toBeTruthy();
            resolveFirstAttempt?.();
            await Promise.resolve();

            const secondAttempt = api.importTransactions('account-1', transactions);
            await secondAttempt;

            expect(callPayloads).toHaveLength(2);
            expect(callPayloads[0]).toEqual(callPayloads[1]);
            expect(importTransactionsMock).toHaveBeenCalledTimes(2);
            const secondPayloadIds = callPayloads[1];
            expect(new Set(secondPayloadIds).size).toBe(secondPayloadIds.length);
            expect(serverRecords.size).toBe(2);
        } finally {
            try {
                await vi.runOnlyPendingTimersAsync();
                vi.clearAllTimers();
            } finally {
                vi.useRealTimers();
            }
        }
    });

    it('ignores shutdown when the API was never initialised', async () => {
        const { default: ActualApi } = await import(
            '../src/utils/ActualApi.js'
        );

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
});
