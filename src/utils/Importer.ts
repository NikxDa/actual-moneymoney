import { format, isSameDay, isSameHour, parse, subMonths } from 'date-fns';
import PayeeTransformer from './PayeeTransformer.js';
import {
    Transaction as MonMonTransaction,
    Account as MonMonAccount,
    getAccounts,
    getTransactions,
} from 'moneymoney';
import { DATE_FORMAT } from './shared.js';
import { ActualBudgetConfig, getConfig } from './config.js';
import ActualApi from './ActualApi.js';
import Logger from './Logger.js';
import { getCache, updateCache } from './cache.js';

class Importer {
    constructor(
        private budgetConfig: ActualBudgetConfig,
        private actualApi: ActualApi,
        private logger: Logger,
        private payeeTransformer?: PayeeTransformer
    ) {}

    private getMoneyMoneyAccountByRef(accounts: MonMonAccount[], ref: string) {
        // Search by UUID first, if the ref is a UUID
        let account = accounts.find((acc) => acc.uuid === ref);
        if (account) {
            return account;
        }

        // Next, search by account number
        account = accounts.find((acc) => acc.accountNumber === ref);
        if (account) {
            return account;
        }

        // Lastly, search by account name
        const matchingNames = accounts.filter((acc) => acc.name === ref);
        if (matchingNames.length > 0) {
            if (matchingNames.length > 1) {
                this.logger.warn(
                    `Found multiple MoneyMoney accounts with the name '${ref}'. Using the first one.`
                );
            }

            return matchingNames[0];
        }

        return null;
    }

    private getActualAccountByRef(accounts: Account[], ref: string) {
        // Search by UUID first, if the ref is a UUID
        let account = accounts.find((acc) => acc.id === ref);
        if (account) {
            return account;
        }

        // Next, search by name
        const matchingNames = accounts.filter((acc) => acc.name === ref);
        if (matchingNames.length > 0) {
            if (matchingNames.length > 1) {
                this.logger.warn(
                    `Found multiple Actual accounts with the name '${ref}'. Using the first one.`
                );
            }

            return matchingNames[0];
        }

        return null;
    }

    async parseAccountMapping() {
        const accountMapping = this.budgetConfig.accountMapping;
        const parsedAccountMapping: Map<MonMonAccount, Account> = new Map();

        const moneyMoneyAccounts = await getAccounts();
        this.logger.info(
            `Found ${moneyMoneyAccounts.length} accounts in MoneyMoney.`
        );

        const actualAccounts = await this.actualApi.getAccounts();
        this.logger.info(`Found ${actualAccounts.length} accounts in Actual.`);

        for (const [moneyMoneyRef, actualRef] of Object.entries(
            accountMapping
        )) {
            const moneyMoneyAccount = this.getMoneyMoneyAccountByRef(
                moneyMoneyAccounts,
                moneyMoneyRef
            );

            if (!moneyMoneyAccount) {
                this.logger.warn(
                    `No MoneyMoney account found for reference '${moneyMoneyRef}'. Skipping...`
                );
                continue;
            }

            const actualAccount = this.getActualAccountByRef(
                actualAccounts,
                actualRef
            );

            if (!actualAccount) {
                this.logger.warn(
                    `No Actual account found for reference '${actualRef}'. Skipping...`
                );
                continue;
            }

            this.logger.info(
                `MoneyMoney account '${moneyMoneyAccount.name}' will import to Actual account '${actualAccount.name}'.`
            );

            parsedAccountMapping.set(moneyMoneyAccount, actualAccount);
        }

        return parsedAccountMapping;
    }

    async importTransactions({
        accountMapping,
        from,
        isDryRun = false,
    }: {
        accountMapping: Map<MonMonAccount, Account>;
        from?: Date;
        isDryRun?: boolean;
    }) {
        const cache = await getCache();
        const lastImportDate = cache.lastImportDate
            ? parse(cache.lastImportDate, DATE_FORMAT, new Date())
            : null;

        const fromDate = from ?? lastImportDate ?? subMonths(new Date(), 1);

        let monMonTransactionsSinceFromDate = await getTransactions({
            from: fromDate,
        });

        this.logger.info(
            `Found ${
                monMonTransactionsSinceFromDate.length
            } total transactions in MoneyMoney since ${format(
                fromDate,
                DATE_FORMAT
            )}`
        );

        const monMonTransactionMap = monMonTransactionsSinceFromDate.reduce(
            (acc, transaction) => {
                if (!acc[transaction.accountUuid]) {
                    acc[transaction.accountUuid] = [];
                }

                acc[transaction.accountUuid].push(transaction);

                return acc;
            },
            {} as Record<string, MonMonTransaction[]>
        );

        for (const [monMonAccountUuid, monMonTransactions] of Object.entries(
            monMonTransactionMap
        )) {
            this.logger.debug(
                `Found ${monMonTransactions.length} transactions for account ${monMonAccountUuid}`
            );
        }

        // Iterate over account mapping
        for (const [monMonAccount, actualAccount] of accountMapping) {
            const monMonTransactions =
                monMonTransactionMap[monMonAccount.uuid] ?? [];

            let createTransactions: CreateTransaction[] = [];
            for (const monMonTransaction of monMonTransactions) {
                createTransactions.push(
                    await this.convertToActualTransaction(monMonTransaction)
                );
            }

            const existingActualTransactions =
                await this.actualApi.getTransactions(actualAccount.id);

            this.logger.debug(
                `Found ${existingActualTransactions.length} existing transactions for Actual account '${actualAccount.name}'`
            );

            // Push start transaction if no transactions exist
            if (existingActualTransactions.length === 0) {
                const startTransaction: CreateTransaction = {
                    date: format(
                        monMonTransactions.length > 0
                            ? monMonTransactions[monMonTransactions.length - 1]
                                  .valueDate
                            : lastImportDate ?? new Date(),
                        DATE_FORMAT
                    ),
                    amount: this.getStartingBalanceForAccount(
                        monMonAccount,
                        monMonTransactions
                    ),
                    imported_id: `${monMonAccount.uuid}-start`,
                    cleared: true,
                    notes: 'Starting balance',
                    imported_payee: 'Starting balance',
                };

                this.logger.debug(
                    `No existing transactions found for Actual account '${actualAccount.name}'. Adding start transaction with amount ${startTransaction.amount}...`
                );

                createTransactions.push(startTransaction);
            }

            // Filter out transactions that already exist in Actual
            createTransactions = createTransactions.filter(
                async (transaction) => {
                    const transactionExists = existingActualTransactions.some(
                        (existingTransaction) =>
                            existingTransaction.imported_id ===
                            transaction.imported_id
                    );

                    return !transactionExists;
                }
            );

            if (createTransactions.length === 0) {
                this.logger.info(
                    `No new transactions found for Actual account '${actualAccount.name}'. Skipping...`
                );
                continue;
            }

            this.logger.info(
                `Importing ${createTransactions.length} transactions to Actual account '${actualAccount.name}'...`
            );

            if (this.payeeTransformer && !isDryRun) {
                this.logger.debug(
                    `Cleaning up payee names for ${createTransactions.length} transaction/s using OpenAI...`
                );

                const transactionPayees = createTransactions.map(
                    (t) => t.imported_payee as string
                );

                const transformedPayees =
                    await this.payeeTransformer.transformPayees(
                        transactionPayees
                    );

                if (transformedPayees !== null) {
                    createTransactions.forEach((t, i) => {
                        t.payee_name =
                            transformedPayees[t.imported_payee as string];
                    });
                } else {
                    this.logger.warn(
                        'Payee transformation failed. Using default payee names...'
                    );

                    createTransactions.forEach((t) => {
                        t.payee_name = t.imported_payee;
                    });
                }
            } else {
                this.logger.debug(
                    `Payee transformation is disabled. Using default payee names...`
                );

                createTransactions.forEach((t) => {
                    t.payee_name = t.imported_payee;
                });
            }

            if (!isDryRun) {
                await this.actualApi.addTransactions(
                    actualAccount.id,
                    createTransactions
                );

                const updatedCache = {
                    ...cache,
                    lastImportDate: format(new Date(), DATE_FORMAT),
                };

                await updateCache(updatedCache);
            }
        }
    }

    private async convertToActualTransaction(
        transaction: MonMonTransaction
    ): Promise<CreateTransaction> {
        const previousTransactionWithSameImportedPayee =
            await this.actualApi.getTransactionsByImportedPayee(
                transaction.name
            );

        return {
            date: format(transaction.valueDate, 'yyyy-MM-dd'),
            amount: Math.round(transaction.amount * 100),
            imported_id: this.getIdForMoneyMoneyTransaction(transaction),
            imported_payee: transaction.name,
            cleared: transaction.booked,
            notes: transaction.purpose,
            // payee_name: transaction.name,
        };
    }

    private getIdForMoneyMoneyTransaction(transaction: MonMonTransaction) {
        return `${transaction.accountUuid}-${transaction.id}`;
    }

    private getStartingBalanceForAccount(
        account: MonMonAccount,
        transactions: MonMonTransaction[]
    ) {
        const monMonAccountBalance = account.balance[0][0];
        const totalExpenses = transactions.reduce(
            (acc, transaction) =>
                acc + (transaction.booked ? transaction.amount : 0),
            0
        );

        const startingBalance = Math.round(
            (monMonAccountBalance - totalExpenses) * 100
        );

        return startingBalance;
    }
}

export default Importer;
