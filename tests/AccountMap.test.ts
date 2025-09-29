import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMap } from '../src/utils/AccountMap.js';
import type ActualApi from '../src/utils/ActualApi.js';
import type { ActualBudgetConfig } from '../src/utils/config.js';
import type Logger from '../src/utils/Logger.js';

const { getAccountsMock } = vi.hoisted(() => ({
    getAccountsMock: vi.fn(),
}));

vi.mock('moneymoney', () => ({
    getAccounts: getAccountsMock,
}));

const createLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    getLevel: vi.fn().mockReturnValue(0),
});

const createTestLogger = () => createLogger() as unknown as Logger & ReturnType<typeof createLogger>;

describe('AccountMap', () => {
    beforeEach(() => {
        getAccountsMock.mockReset();
    });

    const createBudgetConfig = (accountMapping: Record<string, string>): ActualBudgetConfig => ({
        syncId: 'budget-test',
        earliestImportDate: undefined,
        e2eEncryption: { enabled: false, password: '' },
        accountMapping,
    });

    const createActualApi = (
        accounts: Array<{
            id: string;
            name: string;
            type: 'checking' | 'savings' | 'credit' | 'investment' | 'mortgage' | 'debt' | 'other';
            offbudget: boolean;
            closed: boolean;
        }>
    ): ActualApi =>
        ({
            getAccounts: vi.fn().mockResolvedValue(accounts),
        }) as unknown as ActualApi;

    it('throws when a MoneyMoney account reference is unresolved without filters', async () => {
        const budgetConfig = createBudgetConfig({
            'missing-account': 'actual-existing',
        });
        getAccountsMock.mockResolvedValue([
            {
                uuid: 'another-account',
                accountNumber: 'DE02',
                name: 'Other Account',
            },
        ]);
        const actualApi = createActualApi([
            {
                id: 'actual-existing',
                name: 'Existing Actual',
                type: 'checking',
                offbudget: false,
                closed: false,
            },
        ]);
        const logger = createTestLogger();
        const accountMap = new AccountMap(budgetConfig, logger, actualApi);

        await expect(accountMap.loadFromConfig()).rejects.toThrow(
            "Failed to resolve account mapping for budget 'budget-test'. MoneyMoney account reference 'missing-account' did not match any MoneyMoney accounts."
        );
        expect(logger.error).toHaveBeenCalledWith(
            "MoneyMoney account reference 'missing-account' did not match any MoneyMoney accounts."
        );
    });

    it('throws when an Actual account reference is unresolved without filters', async () => {
        const budgetConfig = createBudgetConfig({
            'known-account': 'missing-actual',
        });
        getAccountsMock.mockResolvedValue([
            {
                uuid: 'known-account',
                accountNumber: 'DE03',
                name: 'Known Account',
            },
        ]);
        const actualApi = createActualApi([]);
        const logger = createTestLogger();
        const accountMap = new AccountMap(budgetConfig, logger, actualApi);

        await expect(accountMap.loadFromConfig()).rejects.toThrow(
            "Failed to resolve account mapping for budget 'budget-test'. Actual account reference 'missing-actual' did not match any Actual accounts."
        );
        expect(logger.error).toHaveBeenCalledWith(
            "Actual account reference 'missing-actual' did not match any Actual accounts."
        );
    });

    it('skips unresolved mappings outside the filtered account list', async () => {
        const budgetConfig = createBudgetConfig({
            'primary-account': 'actual-primary',
            'secondary-account': 'actual-secondary',
        });
        const moneyMoneyPrimary = {
            uuid: 'primary-account',
            accountNumber: 'DE04',
            name: 'Primary Account',
        };
        const moneyMoneySecondary = {
            uuid: 'secondary-account',
            accountNumber: 'DE05',
            name: 'Secondary Account',
        };
        getAccountsMock.mockResolvedValue([moneyMoneyPrimary, moneyMoneySecondary]);
        const actualApi = createActualApi([
            {
                id: 'actual-primary',
                name: 'Primary Actual',
                type: 'checking',
                offbudget: false,
                closed: false,
            },
        ]);
        const logger = createTestLogger();
        const accountMap = new AccountMap(budgetConfig, logger, actualApi);

        await accountMap.loadFromConfig({ accountRefs: ['primary-account'] });

        const mapping = accountMap.getMap();
        expect(mapping.size).toBe(1);
        const [entry] = Array.from(mapping.entries());
        expect(entry).toBeDefined();
        if (!entry) {
            throw new Error('Mapping entry missing');
        }
        const [monMonAccount, actualAccount] = entry;
        expect(monMonAccount).toBe(moneyMoneyPrimary);
        expect(actualAccount.id).toBe('actual-primary');
        expect(logger.error).not.toHaveBeenCalled();
    });
});
