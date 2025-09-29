import type { Account as MonMonAccount } from 'moneymoney';
import { getAccounts } from 'moneymoney';
import ActualApi from './ActualApi.js';
import type { ActualBudgetConfig } from './config.js';
import Logger from './Logger.js';

// Use the return type of ActualApi.getAccounts() to get the canonical Account type
type ActualAccount = Awaited<ReturnType<ActualApi['getAccounts']>>[number];

interface LoadFromConfigOptions {
    readonly accountRefs?: ReadonlyArray<string>;
}

export class AccountMap {
    public constructor(
        private budgetConfig: ActualBudgetConfig,
        private logger: Logger,
        private actualApi: ActualApi
    ) {}

    private moneyMoneyAccounts: Array<MonMonAccount> = [];
    private actualAccounts: Array<ActualAccount> = [];

    private mapping: Map<MonMonAccount, ActualAccount> | null = null;
    private _isLoading = false;

    public getMap(moneyMoneyAccountRefs?: Array<string>): Map<MonMonAccount, ActualAccount> {
        if (!this.mapping) {
            throw new Error('Account mapping has not been loaded. Call loadFromConfig() before accessing the map.');
        }

        if (!moneyMoneyAccountRefs) return this.mapping;

        const customMap = new Map<MonMonAccount, ActualAccount>();
        for (const ref of moneyMoneyAccountRefs) {
            const monMonAccount = this.getMoneyMoneyAccountByRef(ref);

            if (!monMonAccount) {
                this.logger.error(`Specified account ref '${ref}' did not resolve to any MoneyMoney accounts.`);
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

    private checkMoneyMoneyAccountRef(account: MonMonAccount, ref: string): boolean {
        const r = String(ref).trim();
        return (
            String(account.uuid ?? '').trim() === r ||
            String(account.accountNumber ?? '').trim() === r ||
            String(account.name ?? '').trim() === r
        );
    }

    public getMoneyMoneyAccountByRef(ref: string) {
        const matchingAccounts = this.moneyMoneyAccounts.filter((acc) => this.checkMoneyMoneyAccountRef(acc, ref));

        if (matchingAccounts.length === 0) {
            this.logger.warn(`No MoneyMoney account found for reference '${ref}'.`);

            return null;
        } else if (matchingAccounts.length > 1) {
            this.logger.warn(
                `Found multiple MoneyMoney accounts matching the reference '${ref}'. Using the first one.`
            );
        }

        return matchingAccounts[0];
    }

    private checkActualAccountRef(account: ActualAccount, ref: string) {
        return account.id === ref || account.name === ref;
    }

    public getActualAccountByRef(ref: string): ActualAccount | null {
        const matchingAccounts = this.actualAccounts.filter((acc) => this.checkActualAccountRef(acc, ref));

        if (matchingAccounts.length === 0) {
            this.logger.warn(`No Actual account found for reference '${ref}'.`);

            return null;
        } else if (matchingAccounts.length > 1) {
            this.logger.warn(`Found multiple Actual accounts matching the reference '${ref}'. Using the first one.`);
        }

        return matchingAccounts[0] ?? null;
    }

    public async loadFromConfig(options: LoadFromConfigOptions = {}): Promise<void> {
        if (this.mapping) return;
        if (this._isLoading) {
            this.logger.debug('Account mapping is already being loaded, skipping concurrent request.');
            return;
        }
        this._isLoading = true;

        const accountMapping = this.budgetConfig.accountMapping ?? {};
        if (typeof accountMapping !== 'object' || accountMapping === null) {
            throw new Error(
                'Invalid budget configuration: accountMapping must be an object like { moneyMoneyRef: actualRef }.'
            );
        }
        const parsedAccountMapping: Map<MonMonAccount, ActualAccount> = new Map();

        const accountRefsFilter =
            options.accountRefs && options.accountRefs.length > 0 ? new Set(options.accountRefs) : null;
        const unresolvedErrors: string[] = [];

        const [moneyMoneyAccounts, actualAccounts] = await Promise.all([getAccounts(), this.actualApi.getAccounts()]);
        this.moneyMoneyAccounts = moneyMoneyAccounts;
        this.logger.debug(`Found ${this.moneyMoneyAccounts.length} accounts in MoneyMoney.`);
        this.actualAccounts = actualAccounts as Array<ActualAccount>;
        this.logger.debug(`Found ${this.actualAccounts.length} accounts in Actual.`);

        const entries = Object.entries(accountMapping as Record<string, string>);
        this.logger.debug(`Account mapping contains ${entries.length} entries.`);

        for (const [moneyMoneyRef, actualRef] of entries) {
            const moneyMoneyAccount = this.getMoneyMoneyAccountByRef(moneyMoneyRef);

            const actualAccount = this.getActualAccountByRef(actualRef);

            const requiresResolution = accountRefsFilter === null || accountRefsFilter.has(moneyMoneyRef);

            if (!moneyMoneyAccount) {
                const message = `MoneyMoney account reference '${moneyMoneyRef}' did not match any MoneyMoney accounts.`;

                if (requiresResolution) {
                    this.logger.error(message);
                    unresolvedErrors.push(message);
                } else {
                    this.logger.debug(
                        `Skipping account mapping for MoneyMoney reference '${moneyMoneyRef}' because it is not part of the import filter.`
                    );
                }
            }

            if (!actualAccount) {
                const message = `Actual account reference '${actualRef}' did not match any Actual accounts.`;

                if (requiresResolution) {
                    this.logger.error(message);
                    unresolvedErrors.push(message);
                } else {
                    this.logger.debug(
                        `Skipping account mapping for Actual reference '${actualRef}' because it is not part of the import filter.`
                    );
                }
            }

            if (!moneyMoneyAccount || !actualAccount) {
                continue;
            }

            this.logger.debug(
                `MoneyMoney account '${moneyMoneyAccount.name}' will import to Actual account '${actualAccount.name}'.`
            );

            parsedAccountMapping.set(moneyMoneyAccount, actualAccount);
        }

        if (unresolvedErrors.length > 0) {
            const header = `Failed to resolve account mapping for budget '${this.budgetConfig.syncId}'.`;
            const details =
                unresolvedErrors.length === 1 ? ` ${unresolvedErrors[0]}` : `\n - ${unresolvedErrors.join('\n - ')}`;
            throw new Error(`${header}${details}`);
        }

        this.logger.info('Parsed account mapping', [
            '[MoneyMoney Account] → [Actual Account]',
            ...Array.from(parsedAccountMapping.entries()).map(
                ([monMonAccount, actualAccount]) =>
                    `${monMonAccount.name} (${monMonAccount.uuid ?? 'unknown'}) → ${actualAccount.name} (${actualAccount.id})`
            ),
        ]);

        this.mapping = parsedAccountMapping;
        this._isLoading = false;
    }
}
