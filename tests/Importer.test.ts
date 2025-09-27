import { describe, expect, it, beforeEach, vi } from 'vitest';

import type { ActualBudgetConfig, Config } from '../src/utils/config.js';
import Importer from '../src/utils/Importer.js';
import type ActualApi from '../src/utils/ActualApi.js';
import type { AccountMap } from '../src/utils/AccountMap.js';
import type Logger from '../src/utils/Logger.js';
import { LogLevel } from '../src/utils/Logger.js';
import type PayeeTransformer from '../src/utils/PayeeTransformer.js';

const { moneyMoneyTransactionsMock } = vi.hoisted(() => ({
    moneyMoneyTransactionsMock: vi.fn(),
}));

vi.mock('moneymoney', () => ({
    getTransactions: moneyMoneyTransactionsMock,
}));

const createLogger = (level: LogLevel = LogLevel.INFO) => {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLevel: () => level,
    };

    return logger as unknown as Logger & typeof logger;
};

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

    it('skips starting balance when no MoneyMoney transactions exist for the account', async () => {
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
            earliestImportDate: '2024-01-01',
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        const account = {
            uuid: 'primary-account',
            name: 'Checking',
            balance: [[2500]],
        };

        const actualAccount = {
            id: 'actual-1',
            name: 'Checking',
        };

        moneyMoneyTransactionsMock.mockResolvedValue([
            {
                id: 'other-transaction',
                accountUuid: 'other-account',
                name: 'Other',
                purpose: 'Something else',
                comment: '',
                valueDate: new Date('2024-01-15T00:00:00Z'),
                bookingDate: new Date('2024-01-16T00:00:00Z'),
                amount: 42,
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
            importTransactions: vi.fn(),
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

        const logger = createLogger(LogLevel.DEBUG);

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            logger as unknown as Logger,
            accountMap as unknown as AccountMap,
            undefined
        );

        await importer.importTransactions({});

        expect(actualApi.importTransactions).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
            "Skipping starting balance for Actual account 'Checking' because no MoneyMoney transactions were found for account primary-account in this import window.",
            [
                'Extend the date range or review ignore patterns if a starting balance is expected.',
            ]
        );
    });

    it('does not warn when Actual already has transactions for the account', async () => {
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
            earliestImportDate: '2024-01-01',
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        const account = {
            uuid: 'primary-account',
            name: 'Checking',
            balance: [[2500]],
        };

        const actualAccount = {
            id: 'actual-1',
            name: 'Checking',
        };

        moneyMoneyTransactionsMock.mockResolvedValue([
            {
                id: 'other-transaction',
                accountUuid: 'other-account',
                name: 'Other',
                purpose: 'Something else',
                comment: '',
                valueDate: new Date('2024-01-15T00:00:00Z'),
                bookingDate: new Date('2024-01-16T00:00:00Z'),
                amount: 42,
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
            getTransactions: vi.fn().mockResolvedValue([
                {
                    imported_id: 'primary-account-existing-1',
                },
            ]),
            importTransactions: vi.fn(),
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

        const logger = createLogger();

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            logger as unknown as Logger,
            accountMap as unknown as AccountMap,
            undefined
        );

        await importer.importTransactions({});

        expect(actualApi.importTransactions).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('creates a starting balance when MoneyMoney has transactions for the account and Actual is empty', async () => {
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
            earliestImportDate: '2024-01-01',
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        const account = {
            uuid: 'primary-account',
            name: 'Checking',
            balance: [[2500]],
        };

        const actualAccount = {
            id: 'actual-1',
            name: 'Checking',
        };

        const moneyMoneyTransaction = {
            id: 'txn-1',
            accountUuid: 'primary-account',
            name: 'Salary',
            purpose: 'Monthly salary',
            comment: '',
            valueDate: new Date('2024-01-05T00:00:00Z'),
            bookingDate: new Date('2024-01-06T00:00:00Z'),
            amount: 5000,
            booked: true,
            bankCode: '',
            accountNumber: '',
            partner: '',
            partnerAccount: '',
            category: '',
            purposeCode: '',
            currencyCode: 'EUR',
            balance: 0,
        };

        moneyMoneyTransactionsMock.mockResolvedValue([moneyMoneyTransaction]);

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

        const logger = createLogger();

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            logger as unknown as Logger,
            accountMap as unknown as AccountMap,
            undefined
        );

        await importer.importTransactions({});

        expect(logger.warn).not.toHaveBeenCalled();
        expect(actualApi.importTransactions).toHaveBeenCalledTimes(1);

        const [, createTransactions] = actualApi.importTransactions.mock.calls[0];
        expect(createTransactions).toHaveLength(2);

        const importedIds = createTransactions.map((transaction: { imported_id?: string }) => transaction.imported_id);
        expect(importedIds).toContain('primary-account-start');
        expect(importedIds).toContain('primary-account-txn-1');
    });

    it('imports new transactions for mapped accounts while skipping duplicates and unchecked entries', async () => {
        const config: Config = {
            payeeTransformation: {
                enabled: false,
                skipModelValidation: false,
                openAiModel: 'gpt-3.5-turbo',
            },
            import: {
                importUncheckedTransactions: false,
                synchronizeClearedStatus: true,
                maskPayeeNamesInLogs: false,
            },
            actualServers: [],
        };

        const budgetConfig: ActualBudgetConfig = {
            syncId: 'budget-1',
            earliestImportDate: undefined,
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        const primaryAccount = {
            uuid: 'primary-account',
            name: 'Checking',
            balance: [[1200]],
        };

        const savingsAccount = {
            uuid: 'savings-account',
            name: 'Savings',
            balance: [[1000]],
        };

        const primaryActualAccount = {
            id: 'actual-1',
            name: 'Checking',
        };

        const savingsActualAccount = {
            id: 'actual-2',
            name: 'Savings',
        };

        moneyMoneyTransactionsMock.mockResolvedValue([
            {
                id: 'txn-1',
                accountUuid: 'primary-account',
                name: 'Groceries',
                purpose: 'Weekly groceries',
                comment: '',
                valueDate: new Date('2024-03-05T00:00:00Z'),
                bookingDate: new Date('2024-03-06T00:00:00Z'),
                amount: 80.25,
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
            {
                id: 'txn-2',
                accountUuid: 'primary-account',
                name: 'Pending payment',
                purpose: 'Pending',
                comment: '',
                valueDate: new Date('2024-03-08T00:00:00Z'),
                bookingDate: new Date('2024-03-09T00:00:00Z'),
                amount: 15,
                booked: false,
                bankCode: '',
                accountNumber: '',
                partner: '',
                partnerAccount: '',
                category: '',
                purposeCode: '',
                currencyCode: 'EUR',
                balance: 0,
            },
            {
                id: 'txn-3',
                accountUuid: 'savings-account',
                name: 'Interest',
                purpose: 'Monthly interest',
                comment: '',
                valueDate: new Date('2024-03-10T00:00:00Z'),
                bookingDate: new Date('2024-03-11T00:00:00Z'),
                amount: 75.5,
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
            getTransactions: vi.fn().mockImplementation(async (accountId: string) => {
                if (accountId === 'actual-1') {
                    return [
                        {
                            imported_id: 'primary-account-txn-1',
                        },
                    ];
                }

                if (accountId === 'actual-2') {
                    return [];
                }

                throw new Error(`Unexpected account id ${accountId}`);
            }),
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
                        primaryAccount,
                        primaryActualAccount,
                    ],
                    [
                        savingsAccount,
                        savingsActualAccount,
                    ],
                ]),
        };

        const from = new Date('2024-03-01T00:00:00Z');
        const to = new Date('2024-03-31T00:00:00Z');

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            createLogger() as unknown as Logger,
            accountMap as unknown as AccountMap,
            undefined
        );

        await importer.importTransactions({ from, to });

        expect(moneyMoneyTransactionsMock).toHaveBeenCalledWith({
            from,
            to,
        });

        expect(actualApi.getTransactions).toHaveBeenCalledTimes(2);
        expect(actualApi.getTransactions).toHaveBeenNthCalledWith(1, 'actual-1', {
            from,
            to,
        });
        expect(actualApi.getTransactions).toHaveBeenNthCalledWith(2, 'actual-2', {
            from,
            to,
        });

        expect(actualApi.importTransactions).toHaveBeenCalledTimes(1);

        const [actualAccountId, createTransactions] = actualApi.importTransactions.mock.calls[0];
        expect(actualAccountId).toBe('actual-2');
        expect(createTransactions).toHaveLength(2);

        const transactionIds = createTransactions.map((transaction: { imported_id?: string }) => transaction.imported_id);
        expect(transactionIds).toEqual([
            'savings-account-txn-3',
            'savings-account-start',
        ]);

        expect(createTransactions[0]).toMatchObject({
            amount: 7550,
            imported_payee: 'Interest',
            payee_name: 'Interest',
            cleared: true,
        });
        expect(createTransactions[1]).toMatchObject({
            imported_id: 'savings-account-start',
            cleared: true,
            notes: 'Starting balance',
            imported_payee: 'Starting balance',
        });
    });

    it('applies payee transformation results to new transactions', async () => {
        const config: Config = {
            payeeTransformation: {
                enabled: true,
                skipModelValidation: false,
                openAiModel: 'gpt-4o-mini',
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
            earliestImportDate: undefined,
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        const moneyMoneyTransaction = {
            id: 'txn-10',
            accountUuid: 'primary-account',
            name: 'Coffee Shop',
            purpose: 'Morning coffee',
            comment: '',
            valueDate: new Date('2024-04-01T00:00:00Z'),
            bookingDate: new Date('2024-04-02T00:00:00Z'),
            amount: 8.75,
            booked: true,
            bankCode: '',
            accountNumber: '',
            partner: '',
            partnerAccount: '',
            category: '',
            purposeCode: '',
            currencyCode: 'EUR',
            balance: 0,
        };

        moneyMoneyTransactionsMock.mockResolvedValue([moneyMoneyTransaction]);

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
                        {
                            uuid: 'primary-account',
                            name: 'Checking',
                            balance: [[1200]],
                        },
                        {
                            id: 'actual-1',
                            name: 'Checking',
                        },
                    ],
                ]),
        };

        const payeeTransformer = {
            transformPayees: vi.fn().mockResolvedValue({
                'Coffee Shop': 'Coffee Shop (AI cleaned)',
                'Starting balance': 'Starting balance',
            }),
        };

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            createLogger() as unknown as Logger,
            accountMap as unknown as AccountMap,
            payeeTransformer as unknown as PayeeTransformer
        );

        await importer.importTransactions({});

        expect(payeeTransformer.transformPayees).toHaveBeenCalledWith([
            'Coffee Shop',
            'Starting balance',
        ]);

        const [, createTransactions] = actualApi.importTransactions.mock.calls[0];
        const transaction = createTransactions.find(
            (entry: { imported_id?: string }) =>
                entry.imported_id === 'primary-account-txn-10'
        );

        expect(transaction?.payee_name).toBe('Coffee Shop (AI cleaned)');
        expect(transaction?.imported_payee).toBe('Coffee Shop');
    });

    it('masks payee names in logs when transformation fails', async () => {
        const config: Config = {
            payeeTransformation: {
                enabled: true,
                skipModelValidation: false,
                openAiModel: 'gpt-4o-mini',
            },
            import: {
                importUncheckedTransactions: true,
                synchronizeClearedStatus: false,
                maskPayeeNamesInLogs: true,
            },
            actualServers: [],
        };

        const budgetConfig: ActualBudgetConfig = {
            syncId: 'budget-1',
            earliestImportDate: undefined,
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        moneyMoneyTransactionsMock.mockResolvedValue([
            {
                id: 'txn-5',
                accountUuid: 'primary-account',
                name: 'Coffee',
                purpose: 'Flat white',
                comment: '',
                valueDate: new Date('2024-04-10T00:00:00Z'),
                bookingDate: new Date('2024-04-11T00:00:00Z'),
                amount: 4.5,
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
                        {
                            uuid: 'primary-account',
                            name: 'Checking',
                            balance: [[50]],
                        },
                        {
                            id: 'actual-1',
                            name: 'Checking',
                        },
                    ],
                ]),
        };

        const payeeTransformer = {
            transformPayees: vi.fn().mockResolvedValue(null),
        };

        const logger = createLogger();

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            logger,
            accountMap as unknown as AccountMap,
            payeeTransformer as unknown as PayeeTransformer
        );

        await importer.importTransactions({});

        expect(payeeTransformer.transformPayees).toHaveBeenCalledWith([
            'Coffee',
            'Starting balance',
        ]);

        expect(logger.warn).toHaveBeenCalledWith(
            'Payee transformation failed. Using default payee names...'
        );

        const maskedCall = logger.debug.mock.calls.find(
            ([message]) => message === 'Final payee names for import (masked):'
        );

        expect(maskedCall?.[1]).toHaveLength(2);
        (maskedCall?.[1] as Array<string>).forEach((token) => {
            expect(token).toMatch(/^"PAYEE#[0-9A-F]{8}"$/);
        });

        const [, createTransactions] = actualApi.importTransactions.mock.calls[0];
        createTransactions.forEach((transaction: { payee_name?: string; imported_payee?: string }) => {
            expect(transaction.payee_name).toBe(transaction.imported_payee);
        });
    });

    it('logs raw payee names when masking is disabled', async () => {
        const config: Config = {
            payeeTransformation: {
                enabled: false,
                skipModelValidation: false,
                openAiModel: 'gpt-3.5-turbo',
            },
            import: {
                importUncheckedTransactions: true,
                synchronizeClearedStatus: false,
                maskPayeeNamesInLogs: false,
            },
            actualServers: [],
        };

        const budgetConfig: ActualBudgetConfig = {
            syncId: 'budget-1',
            earliestImportDate: undefined,
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        moneyMoneyTransactionsMock.mockResolvedValue([
            {
                id: 'txn-6',
                accountUuid: 'primary-account',
                name: 'Bakery',
                purpose: 'Baguette',
                comment: '',
                valueDate: new Date('2024-04-10T00:00:00Z'),
                bookingDate: new Date('2024-04-11T00:00:00Z'),
                amount: 3.25,
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
                        {
                            uuid: 'primary-account',
                            name: 'Checking',
                            balance: [[50]],
                        },
                        {
                            id: 'actual-1',
                            name: 'Checking',
                        },
                    ],
                ]),
        };

        const logger = createLogger(LogLevel.DEBUG);

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            logger,
            accountMap as unknown as AccountMap,
            undefined
        );

        await importer.importTransactions({});

        const payeeLogCall = logger.debug.mock.calls.find(
            ([message]) => message === 'Final payee names for import:'
        );

        expect(payeeLogCall?.[1]).toEqual([
            '"Bakery"',
            '"Starting balance"',
        ]);
    });

    it('keeps payee names masked at DEBUG log level when masking is enabled', async () => {
        const config: Config = {
            payeeTransformation: {
                enabled: false,
                skipModelValidation: false,
                openAiModel: 'gpt-3.5-turbo',
            },
            import: {
                importUncheckedTransactions: true,
                synchronizeClearedStatus: false,
                maskPayeeNamesInLogs: true,
            },
            actualServers: [],
        };

        const budgetConfig: ActualBudgetConfig = {
            syncId: 'budget-1',
            earliestImportDate: undefined,
            e2eEncryption: {
                enabled: false,
                password: undefined,
            },
            accountMapping: {},
        };

        moneyMoneyTransactionsMock.mockResolvedValue([
            {
                id: 'txn-6',
                accountUuid: 'primary-account',
                name: 'Bakery',
                purpose: 'Baguette',
                comment: '',
                valueDate: new Date('2024-04-10T00:00:00Z'),
                bookingDate: new Date('2024-04-11T00:00:00Z'),
                amount: 3.25,
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
                        {
                            uuid: 'primary-account',
                            name: 'Checking',
                            balance: [[50]],
                        },
                        {
                            id: 'actual-1',
                            name: 'Checking',
                        },
                    ],
                ]),
        };

        const logger = createLogger(LogLevel.DEBUG);

        const importer = new Importer(
            config,
            budgetConfig,
            actualApi as unknown as ActualApi,
            logger,
            accountMap as unknown as AccountMap
        );

        await importer.importTransactions({});

        const maskedCall = logger.debug.mock.calls.find(
            ([message]) => message === 'Final payee names for import (masked):'
        );

        expect(maskedCall?.[1]).toHaveLength(2);
        (maskedCall?.[1] as Array<string>).forEach((token) => {
            expect(token).toMatch(/^"PAYEE#[0-9A-F]{8}"$/);
        });
    });
});
