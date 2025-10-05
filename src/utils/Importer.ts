import { format, subMonths } from 'date-fns';
import {
    Account as MonMonAccount,
    Transaction as MonMonTransaction,
    getTransactions,
} from 'moneymoney';
import { AccountMap } from './AccountMap.js';
import ActualApi from './ActualApi.js';
import { ActualBudgetConfig, Config } from './config.js';
import Logger from './Logger.js';
import PayeeTransformer from './PayeeTransformer.js';
import { DATE_FORMAT } from './shared.js';

class Importer {
    constructor(
        private config: Config,
        private budgetConfig: ActualBudgetConfig,
        private actualApi: ActualApi,
        private logger: Logger,
        private accountMap: AccountMap,
        private payeeTransformer?: PayeeTransformer
    ) {}

    async importTransactions({
        accountRefs,
        from,
        to: toDate,
        isDryRun = false,
    }: {
        accountRefs?: Array<string>;
        from?: Date;
        to?: Date;
        isDryRun?: boolean;
    }) {
        const fromDate = from ?? subMonths(new Date(), 1);
        const earliestImportDate = this.budgetConfig.earliestImportDate
            ? new Date(this.budgetConfig.earliestImportDate)
            : null;

        const importDate =
            earliestImportDate && earliestImportDate > fromDate
                ? earliestImportDate
                : fromDate;

        if (earliestImportDate && earliestImportDate > fromDate) {
            this.logger.warn(
                `Earliest import date is set to ${format(
                    earliestImportDate,
                    DATE_FORMAT
                )}. Using this date instead of ${format(fromDate, DATE_FORMAT)}.`
            );
        }

        this.logger.debug(
            `Cleared status synchronization is ${
                this.config.import.synchronizeClearedStatus
                    ? 'enabled'
                    : 'disabled'
            }`
        );

        let monMonTransactions = await getTransactions({
            from: importDate,
            to: toDate,
        });

        if (monMonTransactions.length === 0) {
            this.logger.info(
                `No transactions found in MoneyMoney since ${format(
                    importDate,
                    DATE_FORMAT
                )}.`
            );
            return;
        }

        if (!this.config.import.importUncheckedTransactions) {
            monMonTransactions = monMonTransactions.filter((t) => t.booked);
        }

        if (this.config.import.ignorePatterns !== undefined) {
            const ignorePatterns = this.config.import.ignorePatterns;

            monMonTransactions = monMonTransactions.filter((t) => {
                let isIgnored = (ignorePatterns.commentPatterns ?? []).some(
                    (pattern) => t.comment?.includes(pattern)
                );

                isIgnored ||= (ignorePatterns.payeePatterns ?? []).some(
                    (pattern) => t.name.includes(pattern)
                );

                isIgnored ||= (ignorePatterns.purposePatterns ?? []).some(
                    (pattern) => t.purpose?.includes(pattern)
                );

                if (isIgnored) {
                    this.logger.debug(
                        `Ignoring transaction ${t.id} (${t.name}) due to ignore patterns`
                    );
                }

                return !isIgnored;
            });
        }

        this.logger.debug(
            `Found ${
                monMonTransactions.length
            } total transactions in MoneyMoney since ${format(
                importDate,
                DATE_FORMAT
            )}`
        );

        const monMonTransactionMap = monMonTransactions.reduce(
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

        const accountMapping = this.accountMap.getMap(accountRefs);

        // Add early exit if no valid account mappings
        if (accountMapping.size === 0) {
            if (accountRefs && accountRefs.length > 0) {
                this.logger.warn('No valid account mappings found for the specified account filters. Skipping transaction processing.');
                return;
            }
            // If no account filters specified, continue with all accounts
        }

        // Log filtered account mapping
        if (accountMapping.size > 0) {
            this.logger.info('Filtered account mapping', [
                '[MoneyMoney Account] → [Actual Account]',
                ...Array.from(accountMapping.entries()).map(
                    ([monMonAccount, actualAccount]) =>
                        `${monMonAccount.name} → ${actualAccount.name}`
                ),
            ]);
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
                            : new Date(),
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
                this.logger.debug(
                    `No new transactions found for Actual account '${actualAccount.name}'. Skipping...`
                );
                continue;
            }

            this.logger.debug(
                `Considering ${createTransactions.length} transactions for Actual account '${actualAccount.name}'...`
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
                    createTransactions.forEach((t) => {
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
                    isDryRun
                        ? `Skipping payee transformation in dry run mode, using default payee names...`
                        : `Payee transformation is disabled. Using default payee names...`
                );

                createTransactions.forEach((t) => {
                    t.payee_name = t.imported_payee;
                });
            }

            if (!isDryRun) {
                const result = await this.actualApi.importTransactions(
                    actualAccount.id,
                    createTransactions
                );

                if (result.errors && result.errors.length > 0) {
                    this.logger.error('Some errors occurred during import:');
                    for (let i = 0; i < result.errors.length; i++) {
                        this.logger.error(
                            `Error ${i + 1}: ${result.errors[i].message}`
                        );
                    }
                }

                const addedCount = result.added.length;
                const updatedCount = result.updated.length;

                this.logger.info(
                    `Transaction import to account '${actualAccount.name}' successful`,
                    [
                        `Added ${addedCount} new transaction.`,
                        `Updated ${updatedCount} existing transaction.`,
                    ]
                );
            }
        }
    }

    private async convertToActualTransaction(
        transaction: MonMonTransaction
    ): Promise<CreateTransaction> {
        return {
            date: format(transaction.valueDate, 'yyyy-MM-dd'),
            amount: Math.round(transaction.amount * 100),
            imported_id: this.getIdForMoneyMoneyTransaction(transaction),
            imported_payee: transaction.name,
            cleared: this.config.import.synchronizeClearedStatus
                ? transaction.booked
                : undefined,
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
