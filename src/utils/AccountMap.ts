import { Account as MonMonAccount, getAccounts } from 'moneymoney';
import ActualApi from './ActualApi.js';
import { ActualBudgetConfig } from './config.js';
import Logger from './Logger.js';

type Account = {
    id: string;
    name: string;
    type: string;
    offbudget: boolean;
    closed: boolean;
};

export class AccountMap {
    constructor(
        private budgetConfig: ActualBudgetConfig,
        private logger: Logger,
        private actualApi: ActualApi
    ) {}

    private moneyMoneyAccounts: Array<MonMonAccount>;
    private actualAccounts: Array<Account>;

    private mapping: Map<MonMonAccount, Account>;

    public getMap(moneyMoneyAccountRefs?: Array<string>) {
        if (!moneyMoneyAccountRefs) return this.mapping;

        const customMap = new Map<MonMonAccount, Account>();
        const filteredRefs = new Set(
            moneyMoneyAccountRefs.map((ref) => ref.toLowerCase())
        );

        // Log all account mappings with strike-through for filtered ones
        this.logger.info('Account mapping', [
            '[MoneyMoney Account] → [Actual Account]',
            ...Array.from(this.mapping.entries()).map(
                ([monMonAccount, actualAccount]) => {
                    const isFiltered =
                        !filteredRefs.has(monMonAccount.name.toLowerCase()) &&
                        !filteredRefs.has(monMonAccount.uuid.toLowerCase()) &&
                        !filteredRefs.has(
                            monMonAccount.accountNumber?.toLowerCase() || ''
                        );
                    const prefix = isFiltered ? '~~' : '';
                    const suffix = isFiltered ? '~~' : '';
                    return `${prefix}${monMonAccount.name} → ${actualAccount.name}${suffix}`;
                }
            ),
        ]);

        for (const ref of moneyMoneyAccountRefs) {
            const monMonAccount = this.getMoneyMoneyAccountByRef(ref);

            if (!monMonAccount) {
                this.logger.error(
                    `Specified account ref '${ref}' did not resolve to any MoneyMoney accounts.`
                );
                continue;
            }

            const actualAccount = this.mapping.get(monMonAccount);

            if (!actualAccount) {
                this.logger.error(
                    `Could not find an Actual account for specified MoneyMoney account with ref '${ref}'.`
                );
                continue;
            }

            customMap.set(monMonAccount, actualAccount);
        }

        return customMap;
    }

    private checkMoneyMoneyAccountRef(account: MonMonAccount, ref: string) {
        return (
            account.uuid === ref ||
            account.accountNumber === ref ||
            account.name === ref
        );
    }

    public getMoneyMoneyAccountByRef(ref: string) {
        const matchingAccounts = this.moneyMoneyAccounts.filter((acc) =>
            this.checkMoneyMoneyAccountRef(acc, ref)
        );

        if (matchingAccounts.length === 0) {
            this.logger.warn(
                `No MoneyMoney account found for reference '${ref}'.`
            );

            return null;
        } else if (matchingAccounts.length > 1) {
            this.logger.warn(
                `Found multiple MoneyMoney accounts matching the reference '${ref}'. Using the first one.`
            );
        }

        return matchingAccounts[0];
    }

    private checkActualAccountRef(account: Account, ref: string) {
        return account.id === ref || account.name === ref;
    }

    public getActualAccountByRef(ref: string) {
        const matchingAccounts = this.actualAccounts.filter((acc) =>
            this.checkActualAccountRef(acc, ref)
        );

        if (matchingAccounts.length === 0) {
            this.logger.warn(`No Actual account found for reference '${ref}'.`);

            return null;
        } else if (matchingAccounts.length > 1) {
            this.logger.warn(
                `Found multiple Actual accounts matching the reference '${ref}'. Using the first one.`
            );
        }

        return matchingAccounts[0];
    }

    async loadFromConfig() {
        if (this.mapping) {
            this.logger.debug(
                'Account mapping already loaded. Skipping re-load...'
            );
            return;
        }

        const accountMapping = this.budgetConfig.accountMapping;

        const parsedAccountMapping: Map<MonMonAccount, Account> = new Map();

        this.moneyMoneyAccounts = await getAccounts();
        this.logger.debug(
            `Found ${this.moneyMoneyAccounts.length} accounts in MoneyMoney.`
        );

        this.actualAccounts = await this.actualApi.getAccounts();
        this.logger.debug(
            `Found ${this.actualAccounts.length} accounts in Actual.`
        );

        this.logger.debug(
            `Account mapping contains ${Object.entries(accountMapping).length} entries.`
        );

        for (const [moneyMoneyRef, actualRef] of Object.entries(
            accountMapping
        )) {
            const moneyMoneyAccount =
                this.getMoneyMoneyAccountByRef(moneyMoneyRef);

            const actualAccount = this.getActualAccountByRef(actualRef);

            if (!actualAccount) {
                this.logger.debug(
                    `No Actual account found for reference '${actualRef}'. Skipping...`
                );
                continue;
            } else if (!moneyMoneyAccount) {
                this.logger.debug(
                    `No MoneyMoney account found for reference '${moneyMoneyRef}'. Skipping...`
                );
                continue;
            }

            this.logger.debug(
                `MoneyMoney account '${moneyMoneyAccount.name}' will import to Actual account '${actualAccount.name}'.`
            );

            parsedAccountMapping.set(moneyMoneyAccount, actualAccount);
        }

        this.mapping = parsedAccountMapping;
    }
}
