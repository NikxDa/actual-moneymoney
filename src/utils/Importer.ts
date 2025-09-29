import { format, subMonths } from 'date-fns';
import type { CreateTransaction } from '@actual-app/api';
import type { Account as MonMonAccount, Transaction as MonMonTransaction } from 'moneymoney';
import { getTransactions } from 'moneymoney';
import { createHash } from 'node:crypto';
import { AccountMap } from './AccountMap.js';
import ActualApi from './ActualApi.js';
import type { ActualBudgetConfig, Config } from './config.js';
import Logger from './Logger.js';
import PayeeTransformer from './PayeeTransformer.js';
import { DATE_FORMAT } from './shared.js';

class Importer {
    public constructor(
        private config: Config,
        private budgetConfig: ActualBudgetConfig,
        private actualApi: ActualApi,
        private logger: Logger,
        private accountMap: AccountMap,
        private payeeTransformer?: PayeeTransformer
    ) {}

    private readonly patternCache = new Map<string, RegExp>();

    public async importTransactions({
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

        const importDate = earliestImportDate && earliestImportDate > fromDate ? earliestImportDate : fromDate;

        if (earliestImportDate && earliestImportDate > fromDate) {
            this.logger.warn(
                `Earliest import date is set to ${format(
                    earliestImportDate,
                    DATE_FORMAT
                )}. Using this date instead of ${format(fromDate, DATE_FORMAT)}.`
            );
        }

        this.logger.debug(
            `Cleared status synchronization is ${this.config.import.synchronizeClearedStatus ? 'enabled' : 'disabled'}`
        );

        const fetchStartTime = Date.now();
        let monMonTransactions = await getTransactions({
            from: importDate,
            to: toDate,
        });
        monMonTransactions = this.sortTransactions(monMonTransactions);
        const fetchEndTime = Date.now();
        this.logger.debug(`MoneyMoney transaction fetch completed in ${fetchEndTime - fetchStartTime}ms`);

        if (monMonTransactions.length === 0) {
            this.logger.info(`No transactions found in MoneyMoney since ${format(importDate, DATE_FORMAT)}.`);
            return;
        }

        if (!this.config.import.importUncheckedTransactions) {
            monMonTransactions = monMonTransactions.filter((t) => t.booked);
        }

        if (this.config.import.ignorePatterns !== undefined) {
            const ignorePatterns = this.config.import.ignorePatterns;

            monMonTransactions = monMonTransactions.filter((t) => {
                let isIgnored = this.matchesPattern(t.comment, ignorePatterns.commentPatterns);

                isIgnored ||= this.matchesPattern(t.name, ignorePatterns.payeePatterns);

                isIgnored ||= this.matchesPattern(t.purpose, ignorePatterns.purposePatterns);

                if (isIgnored) {
                    this.logger.debug(`Ignoring transaction ${t.id} (${t.name}) due to ignore patterns`);
                }

                return !isIgnored;
            });
        }

        this.logger.debug(
            `Found ${monMonTransactions.length} total transactions in MoneyMoney since ${format(
                importDate,
                DATE_FORMAT
            )}`
        );

        const monMonTransactionMap = monMonTransactions.reduce(
            (acc, transaction) => {
                (acc[transaction.accountUuid] ??= []).push(transaction);

                return acc;
            },
            {} as Record<string, MonMonTransaction[]>
        );

        for (const [monMonAccountUuid, accountTransactions] of Object.entries(monMonTransactionMap)) {
            this.logger.debug(`Found ${accountTransactions.length} transactions for account ${monMonAccountUuid}`);
        }

        const accountMapping = this.accountMap.getMap(accountRefs);
        let hasNewTransactions = false;

        // Iterate over account mapping
        for (const [monMonAccount, actualAccount] of accountMapping) {
            const accountStartTime = Date.now();
            const accountTransactions = monMonTransactionMap[monMonAccount.uuid] ?? [];

            const createTransactions: CreateTransaction[] = await Promise.all(
                accountTransactions.map((t) => this.convertToActualTransaction(t))
            );

            const hasMoneyMoneyTransactionsForAccount = createTransactions.length > 0;

            const existingActualTransactions = await this.actualApi.getTransactions(actualAccount.id, {
                from: importDate,
                to: toDate ?? undefined,
            });

            this.logger.debug(
                `Found ${existingActualTransactions.length} existing transactions for Actual account '${actualAccount.name}'`
            );

            // Push start transaction if no transactions exist
            if (existingActualTransactions.length === 0) {
                if (!hasMoneyMoneyTransactionsForAccount) {
                    this.logger.warn(
                        `Skipping starting balance for Actual account '${actualAccount.name}' because no MoneyMoney transactions were found for account ${monMonAccount.uuid} in this import window.`,
                        ['Extend the date range or review ignore patterns if a starting balance is expected.']
                    );
                } else {
                    // Use the latest transaction (or importDate) as the starting‐balance date
                    const lastTransaction = accountTransactions[accountTransactions.length - 1];
                    const startDate = lastTransaction?.valueDate ?? importDate;
                    const startTransaction: CreateTransaction = {
                        date: format(startDate, DATE_FORMAT),
                        amount: this.getStartingBalanceForAccount(monMonAccount, accountTransactions),
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
            }

            // Filter out transactions that already exist in Actual
            const existingImportedIds = new Set(
                existingActualTransactions
                    .map((existingTransaction) => existingTransaction.imported_id)
                    .filter((id): id is string => Boolean(id))
            );
            const newImportedIds = new Set<string>();

            const filteredTransactions = createTransactions.filter((transaction) => {
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

            if (filteredTransactions.length === 0) {
                this.logger.debug(`No new transactions found for Actual account '${actualAccount.name}'. Skipping...`);
                continue;
            }

            this.logger.debug(
                `Considering ${filteredTransactions.length} transactions for Actual account '${actualAccount.name}'...`
            );

            hasNewTransactions = true;

            if (this.payeeTransformer && !isDryRun) {
                this.logger.debug(
                    `Cleaning up payee names for ${filteredTransactions.length} transaction/s using OpenAI...`
                );

                const startTime = Date.now();
                const transactionPayees = filteredTransactions.map((t) => String(t.imported_payee ?? ''));
                const uniquePayees = Array.from(new Set(transactionPayees));

                const transformedPayees = await this.payeeTransformer.transformPayees(uniquePayees);

                const endTime = Date.now();
                this.logger.debug(`Payee transformation completed in ${endTime - startTime}ms`);

                if (transformedPayees !== null) {
                    this.logger.debug(`Applying transformed payee names to transactions...`);
                    filteredTransactions.forEach((t) => {
                        const originalPayee = t.imported_payee as string;
                        const newPayee = transformedPayees[originalPayee];

                        // Use original payee name if transformation is undefined, null, or "Unknown"
                        t.payee_name = newPayee && newPayee.toLowerCase() !== 'unknown' ? newPayee : originalPayee;
                    });
                    this.logger.debug(`Payee transformation completed successfully.`);
                } else {
                    this.logger.warn('Payee transformation failed. Using default payee names...');

                    filteredTransactions.forEach((t) => {
                        t.payee_name = t.imported_payee;
                    });
                }
            } else {
                if (isDryRun) {
                    this.logger.debug(`Skipping payee transformation in dry run mode, using default payee names...`);
                } else if (!this.payeeTransformer) {
                    this.logger.debug(`Payee transformation is disabled. Using default payee names...`);
                }

                filteredTransactions.forEach((t) => {
                    t.payee_name = t.imported_payee;
                });
            }

            // Log final payee names being used for import
            const shouldMaskPayees = this.config.import.maskPayeeNamesInLogs === true;
            const payeeNamesForLog = filteredTransactions.map((t) => {
                const payeeName = String(t.payee_name ?? '');
                const value = shouldMaskPayees ? this.obfuscatePayeeName(payeeName) : payeeName;
                return `"${value}"`;
            });

            this.logger.debug(
                shouldMaskPayees ? 'Final payee names for import (masked):' : 'Final payee names for import:',
                payeeNamesForLog
            );

            if (isDryRun) {
                this.logger.info(`DRY RUN - Would import to account '${actualAccount.name}'`, [
                    `Would add ${filteredTransactions.length} new transaction(s).`,
                    `No changes made.`,
                ]);
            } else {
                const result = await this.actualApi.importTransactions(actualAccount.id, filteredTransactions);

                const errors = result.errors ?? [];
                if (errors.length > 0) {
                    this.logger.error('Some errors occurred during import:');
                    errors.forEach((error, index) => {
                        if (error) {
                            this.logger.error(`Error ${index + 1}: ${error.message}`);
                        }
                    });
                }

                const addedCount = result.added.length;
                const updatedCount = result.updated.length;

                this.logger.info(`Transaction import to account '${actualAccount.name}' successful`, [
                    `Added ${addedCount} new transaction${addedCount === 1 ? '' : 's'}.`,
                    `Updated ${updatedCount} existing transaction${updatedCount === 1 ? '' : 's'}.`,
                ]);
            }

            const accountEndTime = Date.now();
            this.logger.debug(
                `Account '${actualAccount.name}' processing completed in ${accountEndTime - accountStartTime}ms`
            );
        }

        const totalImportTime = Date.now() - importStartTime;
        this.logger.debug(`Total import process completed in ${totalImportTime}ms`);

        if (!hasNewTransactions) {
            this.logger.info('No new transactions to import.');
        }
    }

    private sortTransactions(transactions: MonMonTransaction[]) {
        return [...transactions].sort((left, right) => {
            const leftTime = this.getTransactionTime(left.valueDate);
            const rightTime = this.getTransactionTime(right.valueDate);

            if (leftTime < rightTime) {
                return -1;
            }

            if (leftTime > rightTime) {
                return 1;
            }

            const leftId = left.id === undefined || left.id === null ? '' : String(left.id);
            const rightId = right.id === undefined || right.id === null ? '' : String(right.id);

            return leftId.localeCompare(rightId);
        });
    }

    private getTransactionTime(valueDate: MonMonTransaction['valueDate']) {
        if (!(valueDate instanceof Date)) {
            return Number.POSITIVE_INFINITY;
        }

        const time = valueDate.getTime();

        if (Number.isNaN(time)) {
            return Number.POSITIVE_INFINITY;
        }

        return time;
    }

    private async convertToActualTransaction(transaction: MonMonTransaction): Promise<CreateTransaction> {
        this.assertValidTransaction(transaction);

        return {
            date: format(transaction.valueDate, DATE_FORMAT),
            amount: Math.round(transaction.amount * 100),
            imported_id: this.getIdForMoneyMoneyTransaction(transaction),
            imported_payee: transaction.name,
            cleared: this.config.import.synchronizeClearedStatus ? transaction.booked : undefined,
            notes: transaction.purpose,
            // payee_name: transaction.name,
        };
    }

    private assertValidTransaction(transaction: MonMonTransaction): void {
        const issues: string[] = [];

        const hasValidDate = transaction.valueDate instanceof Date && !Number.isNaN(transaction.valueDate.getTime());
        if (!hasValidDate) {
            issues.push('valueDate is missing or invalid');
        }

        if (
            typeof transaction.amount !== 'number' ||
            Number.isNaN(transaction.amount) ||
            !Number.isFinite(transaction.amount)
        ) {
            issues.push('amount is missing or invalid');
        }

        const transactionName = transaction.name;
        if (typeof transactionName !== 'string' || transactionName.trim().length === 0) {
            issues.push('name is missing or invalid');
        }

        if (!transaction.id) {
            issues.push('id is missing');
        }

        if (!transaction.accountUuid) {
            issues.push('accountUuid is missing');
        }

        if (issues.length === 0) {
            return;
        }

        const transactionId = transaction.id ?? '(missing)';
        const accountUuid = transaction.accountUuid ?? '(missing)';
        const message = `MoneyMoney returned a malformed transaction (id: ${transactionId}, account: ${accountUuid}). ${issues.join(
            '; '
        )}.`;

        this.logger.error(message, [
            `Transaction ID: ${transactionId}`,
            `MoneyMoney account UUID: ${accountUuid}`,
            'Export a fresh transactions report from MoneyMoney or repair the database before retrying.',
        ]);

        throw new Error(message);
    }

    private getIdForMoneyMoneyTransaction(transaction: MonMonTransaction) {
        return `${transaction.accountUuid}-${transaction.id}`;
    }

    private getStartingBalanceForAccount(account: MonMonAccount, transactions: MonMonTransaction[]) {
        const firstBalanceRow = account.balance[0]; // VERIFY this is the latest/current balance
        const monMonAccountBalance = firstBalanceRow?.[0];

        if (monMonAccountBalance === undefined) {
            this.logger.warn(
                `MoneyMoney account '${account.uuid}' is missing a balance entry. Assuming a starting balance of 0.`,
                ['Check the account configuration or refresh balances in MoneyMoney before re-running the import.']
            );
            return 0;
        }
        const netChange = transactions.reduce(
            (acc, transaction) => acc + (transaction.booked ? transaction.amount : 0),
            0
        );

        const startingBalance = Math.round((monMonAccountBalance - netChange) * 100);

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
        const hash = createHash('sha256').update(payee).digest('hex').slice(0, 8).toUpperCase();

        return `PAYEE#${hash}`;
    }
}

export default Importer;
