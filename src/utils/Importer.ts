import { format, subMonths } from 'date-fns';
import {
    Account as MonMonAccount,
    Transaction as MonMonTransaction,
    getTransactions,
} from 'moneymoney';
import { AccountMap } from './AccountMap.js';
import ActualApi from './ActualApi.js';
import { ActualBudgetConfig, Config } from './config.js';
import Logger, { LogLevel } from './Logger.js';
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

    private readonly patternCache = new Map<string, RegExp>();

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
        const importStartTime = Date.now();
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

        const fetchStartTime = Date.now();
        let monMonTransactions = await getTransactions({
            from: importDate,
            to: toDate,
        });
        const fetchEndTime = Date.now();
        this.logger.debug(
            `MoneyMoney transaction fetch completed in ${fetchEndTime - fetchStartTime}ms`
        );

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
                let isIgnored = this.matchesPattern(
                    t.comment,
                    ignorePatterns.commentPatterns
                );

                isIgnored ||= this.matchesPattern(
                    t.name,
                    ignorePatterns.payeePatterns
                );

                isIgnored ||= this.matchesPattern(
                    t.purpose,
                    ignorePatterns.purposePatterns
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
        let hasNewTransactions = false;

        // Iterate over account mapping
        for (const [monMonAccount, actualAccount] of accountMapping) {
            const accountStartTime = Date.now();
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
            const existingImportedIds = new Set(
                existingActualTransactions
                    .map(
                        (existingTransaction) => existingTransaction.imported_id
                    )
                    .filter((id): id is string => Boolean(id))
            );
            const newImportedIds = new Set<string>();

            createTransactions = createTransactions.filter((transaction) => {
                const importedId = transaction.imported_id;

                if (!importedId) {
                    return true;
                }

                if (existingImportedIds.has(importedId)) {
                    return false;
                }

                if (newImportedIds.has(importedId)) {
                    return false;
                }

                newImportedIds.add(importedId);

                return true;
            });

            if (createTransactions.length === 0) {
                this.logger.debug(
                    `No new transactions found for Actual account '${actualAccount.name}'. Skipping...`
                );
                continue;
            }

            this.logger.debug(
                `Considering ${createTransactions.length} transactions for Actual account '${actualAccount.name}'...`
            );

            hasNewTransactions = true;

            if (this.payeeTransformer && !isDryRun) {
                this.logger.debug(
                    `Cleaning up payee names for ${createTransactions.length} transaction/s using OpenAI...`
                );

                const startTime = Date.now();
                const transactionPayees = createTransactions.map(
                    (t) => t.imported_payee as string
                );

                const transformedPayees =
                    await this.payeeTransformer.transformPayees(
                        transactionPayees
                    );

                const endTime = Date.now();
                this.logger.debug(
                    `Payee transformation completed in ${endTime - startTime}ms`
                );

                if (transformedPayees !== null) {
                    this.logger.debug(
                        `Applying transformed payee names to transactions...`
                    );
                    createTransactions.forEach((t) => {
                        const originalPayee = t.imported_payee as string;
                        const newPayee = transformedPayees[originalPayee];

                        // Use original payee name if transformation is undefined, null, or "Unknown"
                        t.payee_name =
                            newPayee && newPayee !== 'Unknown'
                                ? newPayee
                                : originalPayee;
                    });
                    this.logger.debug(
                        `Payee transformation completed successfully.`
                    );
                } else {
                    this.logger.warn(
                        'Payee transformation failed. Using default payee names...'
                    );

                    createTransactions.forEach((t) => {
                        t.payee_name = t.imported_payee;
                    });
                }
            } else {
                if (isDryRun) {
                    this.logger.debug(
                        `Skipping payee transformation in dry run mode, using default payee names...`
                    );
                } else if (!this.payeeTransformer) {
                    this.logger.debug(
                        `Payee transformation is disabled. Using default payee names...`
                    );
                }

                createTransactions.forEach((t) => {
                    t.payee_name = t.imported_payee;
                });
            }

            // Log final payee names being used for import
            const shouldMaskPayees =
                this.config.import.maskPayeeNamesInLogs &&
                this.logger.getLevel() < LogLevel.DEBUG;
            const payeeNamesForLog = createTransactions.map((t) => {
                const payeeName = String(t.payee_name ?? '');
                const value = shouldMaskPayees
                    ? this.obfuscatePayeeName(payeeName)
                    : payeeName;
                return `"${value}"`;
            });

            this.logger.debug(
                shouldMaskPayees
                    ? 'Final payee names for import (masked):'
                    : 'Final payee names for import:',
                payeeNamesForLog
            );

            if (isDryRun) {
                this.logger.info(
                    `DRY RUN - Would import to account '${actualAccount.name}'`,
                    [
                        `Would add ${createTransactions.length} new transaction(s).`,
                        `No changes made.`,
                    ]
                );
            } else {
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

            const accountEndTime = Date.now();
            this.logger.debug(
                `Account '${actualAccount.name}' processing completed in ${accountEndTime - accountStartTime}ms`
            );
        }

        const totalImportTime = Date.now() - importStartTime;
        this.logger.debug(
            `Total import process completed in ${totalImportTime}ms`
        );

        if (!hasNewTransactions) {
            this.logger.info('No new transactions to import.');
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

    private matchesPattern(value: string | undefined, patterns?: string[]) {
        if (!value || !patterns || patterns.length === 0) {
            return false;
        }

        return patterns.some((pattern) => {
            const regex = this.getPatternRegex(pattern);
            return regex.test(value);
        });
    }

    private getPatternRegex(pattern: string) {
        let regex = this.patternCache.get(pattern);
        if (!regex) {
            const normalized = pattern
                .split('*')
                .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
                .join('.*');
            regex = new RegExp(`^${normalized}$`, 'i');
            this.patternCache.set(pattern, regex);
        }

        return regex;
    }

    private obfuscatePayeeName(payee: string) {
        if (payee.length <= 2) {
            return '•'.repeat(Math.max(payee.length, 1));
        }

        const firstChar = payee[0];
        const lastChar = payee[payee.length - 1];
        const middle = '•'.repeat(payee.length - 2);

        return `${firstChar}${middle}${lastChar}`;
    }
}

export default Importer;
