import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { ActualBudgetConfig, Config } from '../src/utils/config.js';
import Importer from '../src/utils/Importer.js';
import type ActualApi from '../src/utils/ActualApi.js';
import type { AccountMap } from '../src/utils/AccountMap.js';
import type Logger from '../src/utils/Logger.js';
import { LogLevel } from '../src/utils/Logger.js';

const { moneyMoneyTransactionsMock } = vi.hoisted(() => ({
    moneyMoneyTransactionsMock: vi.fn(),
}));

vi.mock('moneymoney', () => ({
    getTransactions: moneyMoneyTransactionsMock,
}));

const createLogger = () =>
    ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLevel: () => LogLevel.INFO,
    } as unknown as Logger);

describe('Importer', () => {
    beforeEach(() => {
        moneyMoneyTransactionsMock.mockReset();
    });

    it('aligns Actual transaction queries with the effective import date', async () => {
        const config: Config = {
            payeeTransformation: {
                enabled: false,
                skipModelValidation: false,
                openAiModel: 'gpt-3.5-turbo',
            },
            import: {
                importUncheckedTransactions: true,
                synchronizeClearedStatus: true,
                maskPayeeNamesInLogs: false,
            },
            actualServers: [],
        };

        const budgetConfig: ActualBudgetConfig = {
            syncId: 'budget-1',
            earliestImportDate: '2024-02-01',
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        const account = {
            uuid: 'account-uuid',
            name: 'Checking',
            balance: [[1000]],
        };

        const actualAccount = {
            id: 'actual-1',
            name: 'Checking',
        };

        moneyMoneyTransactionsMock.mockResolvedValue([
            {
                id: 'txn-1',
                accountUuid: 'account-uuid',
                name: 'Example',
                purpose: 'Purpose',
                comment: '',
                valueDate: new Date('2024-02-15T00:00:00Z'),
                bookingDate: new Date('2024-02-16T00:00:00Z'),
                amount: 123.45,
                booked: true,
                bankCode: '',
                accountNumber: '',
                partner: '',
                partnerAccount: '',
                category: '',
                purposeCode: '',
                currencyCode: 'EUR',
                balance: 0,
            },
        ]);

        const actualApi = {
            getTransactions: vi.fn().mockResolvedValue([]),
            importTransactions: vi.fn().mockResolvedValue({
                added: [],
                updated: [],
                errors: [],
            }),
        };

        const accountMap = {
            getMap: () =>
                new Map([
                    [
                        account,
                        actualAccount,
                    ],
                ]),
        };

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            createLogger() as unknown as Logger,
            accountMap as unknown as AccountMap,
            undefined
        );

        const from = new Date('2024-01-01T00:00:00Z');
        const to = new Date('2024-03-01T00:00:00Z');

        await importer.importTransactions({ from, to });

        const [moneyMoneyArgs] = moneyMoneyTransactionsMock.mock.calls;
        expect(moneyMoneyArgs).toBeDefined();
        expect(moneyMoneyArgs[0].from.toISOString()).toBe(
            '2024-02-01T00:00:00.000Z'
        );
        expect(moneyMoneyArgs[0].to).toBe(to);

        const [actualArgs] = actualApi.getTransactions.mock.calls;
        expect(actualArgs).toBeDefined();
        expect(actualArgs[0]).toBe('actual-1');
        expect(actualArgs[1]?.from.toISOString()).toBe(
            '2024-02-01T00:00:00.000Z'
        );
        expect(actualArgs[1]?.to).toBe(to);
    });
});
