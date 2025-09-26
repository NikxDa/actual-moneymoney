import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { ActualServerConfig } from '../src/utils/config.js';
import type Logger from '../src/utils/Logger.js';
import { LogLevel } from '../src/utils/Logger.js';

const getTransactionsMock = vi.fn();
const shutdownMock = vi.fn();

vi.mock('@actual-app/api', () => ({
    default: {
        init: vi.fn(),
        internal: {
            send: vi.fn(),
        },
        getAccounts: vi.fn(),
        downloadBudget: vi.fn(),
        importTransactions: vi.fn(),
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
    } as unknown as Logger);

describe('ActualApi', () => {
    beforeEach(() => {
        getTransactionsMock.mockReset();
        shutdownMock.mockReset();
    });

    it('passes bounded date ranges to the Actual API and restores console state', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
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

    it('ignores shutdown when the API was never initialised', async () => {
        const { default: ActualApi } = await import('../src/utils/ActualApi.js');

        const serverConfig: ActualServerConfig = {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'secret',
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
