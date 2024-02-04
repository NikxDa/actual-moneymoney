import { format, isSameDay, isSameHour, parse, subMonths } from 'date-fns';
import PayeeTransformer from './PayeeTransformer.js';
import {
    Transaction as MonMonTransaction,
    getAccounts,
    getTransactions,
} from 'moneymoney';
import {
    Listr,
    ListrSimpleRenderer,
    ListrTask,
    ListrTaskWrapper,
} from 'listr2';
import { DATE_FORMAT } from './shared.js';
import prompts from 'prompts';
import actualApi from './actual.js';
import db from './db.js';
import { getConfig } from './config.js';

class Importer {
    async importAccounts(
        syncId: string,
        isDryRun = false,
        task: ListrTaskWrapper<any, ListrSimpleRenderer, ListrSimpleRenderer>
    ) {
        const actualFile = await db.budgetConfig.findUnique({
            where: {
                syncId,
            },
        });

        if (!actualFile) {
            throw new Error('No file with this sync ID found.');
        }

        const moneyMoneyAccounts = await getAccounts();
        task.output = `Found ${moneyMoneyAccounts.length} accounts in MoneyMoney.`;

        const actualAccounts = await actualApi.getAccounts();
        task.output = `Found ${actualAccounts.length} accounts in Actual.`;

        const mappedAccounts = await db.mappedAccount.findMany();

        const accountsToCreate = moneyMoneyAccounts.filter(
            (account) =>
                account.accountNumber &&
                account.accountNumber.length > 0 &&
                !mappedAccounts.some((acc) => acc.moneyMoneyId === account.uuid)
        );

        task.output = `Creating ${accountsToCreate.length} account(s) that weren't previously imported.`;

        let mappedActualAccountIds = mappedAccounts
            .filter((acc) => acc.actualId !== null)
            .map((acc) => acc.actualId);

        for (const account of accountsToCreate) {
            const accountPrompt = await prompts([
                {
                    name: 'mapToAccount',
                    type: 'select',
                    message: `Please pick the Actual account that corresponds to the MoneyMoney account '${account.name}':`,
                    choices: [
                        ...actualAccounts
                            .filter(
                                (acc) =>
                                    !mappedActualAccountIds.includes(acc.id)
                            )
                            .map((acc) => ({
                                title: acc.name,
                                description: `Map the MoneyMoney account '${account.name}' to this account`,
                                value: acc.id,
                            })),
                        {
                            title: '[Create new account]',
                            description:
                                'Create a new account in Actual instead of mapping to an existing account',
                            value: 'create',
                        },
                        {
                            title: '[Skip this account]',
                            description:
                                'Skip this account and do not import transactions',
                            value: 'skip',
                        },
                    ],
                },
            ]);

            if (Object.keys(accountPrompt).length === 0) {
                console.log('Account selection cancelled');
                process.exit(0);
            }

            if (accountPrompt.mapToAccount === 'create') {
                task.output = `Creating new Actual account for MoneyMoney account '${account.name}'...`;

                if (!isDryRun) {
                    const createdAccountId =
                        await actualApi.createAccountFromMoneyMoney(account);

                    await db.mappedAccount.create({
                        data: {
                            moneyMoneyId: account.uuid,
                            actualId: createdAccountId,
                            budgetSyncId: actualFile.syncId,
                        },
                    });

                    mappedActualAccountIds = [
                        ...mappedActualAccountIds,
                        createdAccountId,
                    ];
                }
            } else if (accountPrompt.mapToAccount === 'skip') {
                task.output = `Skipping MoneyMoney account '${account.name}'...`;

                if (!isDryRun) {
                    await db.mappedAccount.create({
                        data: {
                            moneyMoneyId: account.uuid,
                            actualId: null,
                            budgetSyncId: actualFile.syncId,
                        },
                    });
                }
            } else {
                const actualAccount = actualAccounts.find(
                    (acc) => acc.id === accountPrompt.mapToAccount
                );

                if (!actualAccount) {
                    throw new Error(
                        'Failed to find selected Actual account. Please report this bug on GitHub.'
                    );
                }

                task.output = `Mapping MoneyMoney account '${account.name}' to Actual account '${actualAccount.name}'`;

                if (!isDryRun) {
                    await db.mappedAccount.create({
                        data: {
                            moneyMoneyId: account.uuid,
                            actualId: actualAccount.id,
                            budgetSyncId: actualFile.syncId,
                        },
                    });
                }

                mappedActualAccountIds = [
                    ...mappedActualAccountIds,
                    actualAccount.id,
                ];
            }
        }
    }

    async importTransactions({
        syncId,
        from,
        isDryRun = false,
        task,
    }: {
        syncId: string;
        from?: Date;
        isDryRun?: boolean;
        task: ListrTaskWrapper<any, ListrSimpleRenderer, ListrSimpleRenderer>;
    }) {
        const config = await getConfig();

        const actualFile = await db.budgetConfig.findUnique({
            where: {
                syncId,
            },
        });

        if (!actualFile) {
            throw new Error('No file with this sync ID found.');
        }

        const monMonAccounts = await getAccounts();
        task.output = `Found ${monMonAccounts.length} accounts in MoneyMoney`;

        const actualAccounts = await actualApi.getAccounts();

        const fromDate =
            from ?? actualFile.lastImportedAt ?? subMonths(new Date(), 1);

        let transactions = await getTransactions({
            from: fromDate,
        });

        task.output = `Found ${
            transactions.length
        } total transactions in MoneyMoney since ${format(
            fromDate,
            DATE_FORMAT
        )}`;

        if (!actualFile.lastImportedAt) {
            // Pick which transactions to import from the start date
            const transactionsPrompt = await prompts([
                {
                    name: 'avoidDuplicates',
                    type: 'confirm',
                    message: `Do you want to select which transactions to import from ${format(
                        fromDate,
                        DATE_FORMAT
                    )}?`,
                    hint: 'Since this is your first time importing, you can avoid duplicates by selecting which transactions to import.',
                },
                {
                    name: 'importTransactions',
                    type: (prev) => (prev === true ? 'multiselect' : null),
                    message: `Please pick which transactions to import from ${format(
                        fromDate,
                        DATE_FORMAT
                    )}:`,
                    choices: transactions
                        .filter((t) => isSameDay(t.valueDate, fromDate))
                        .map((t) => ({
                            title: `${t.name} (${t.amount} ${t.currency})`,
                            description: `Import this transaction`,
                            value: t.id,
                        })),
                },
            ]);

            if (Object.keys(transactionsPrompt).length === 0) {
                console.log('Transaction selection cancelled');
                process.exit(0);
            }

            if (transactionsPrompt.avoidDuplicates) {
                transactions = transactions.filter(
                    (t) =>
                        !isSameDay(t.valueDate, fromDate) ||
                        transactionsPrompt.importTransactions.includes(t.id)
                );
            }
        }

        const accountTransactionMap = transactions.reduce(
            (acc, transaction) => {
                if (!acc[transaction.accountUuid]) {
                    acc[transaction.accountUuid] = [];
                }

                acc[transaction.accountUuid].push(transaction);

                return acc;
            },
            {} as Record<string, MonMonTransaction[]>
        );

        for (const [accountUuid, transactions] of Object.entries(
            accountTransactionMap
        )) {
            task.output = `Found ${transactions.length} transactions for account ${accountUuid}`;
        }

        for (const [accountUuid, transactions] of Object.entries(
            accountTransactionMap
        )) {
            const mappedAccount = await db.mappedAccount.findUnique({
                where: {
                    moneyMoneyId: accountUuid,
                },
            });

            if (!mappedAccount) {
                task.output = `No Actual account found for MoneyMoney account [${accountUuid}]. Skipping...`;
                continue;
            } else if (!mappedAccount.actualId) {
                task.output = `MoneyMoney account [${accountUuid}] is not mapped. Skipping...`;
                continue;
            }

            const actualAccount = actualAccounts.find(
                (account) => account.id === mappedAccount.actualId
            );

            if (!actualAccount) {
                task.output = `No Actual account [${mappedAccount.actualId}] found. Skipping...`;
                continue;
            }

            const monMonAccount = monMonAccounts.find(
                (account) => account.uuid === accountUuid
            );

            if (!monMonAccount) {
                task.output = `No MoneyMoney account [${accountUuid}] found. Skipping...`;
                continue;
            }

            const monMonAccountBalance = monMonAccount.balance[0][0];
            const totalExpenses = transactions.reduce(
                (acc, transaction) =>
                    acc + (transaction.booked ? transaction.amount : 0),
                0
            );

            const startingBalance = Math.round(
                (monMonAccountBalance - totalExpenses) * 100
            );

            const startTransaction: CreateTransaction = {
                date: format(
                    transactions[transactions.length - 1].valueDate,
                    'yyyy-MM-dd'
                ),
                amount: startingBalance,
                imported_id: `${monMonAccount.uuid}-start`,
                cleared: true,
                notes: 'Starting balance',
            };

            let expenseTransactions: CreateTransaction[] = [];
            for (const transaction of transactions) {
                expenseTransactions.push(
                    await this.convertToActualTransaction(transaction)
                );
            }

            const existingTransactions = await actualApi.getTransactions(
                actualAccount.id
            );

            task.output = `Found ${existingTransactions.length} existing transactions for Actual account '${actualAccount.name}'`;

            const transactionsToImport = [
                ...expenseTransactions,
                ...(existingTransactions.length > 0 ? [] : [startTransaction]),
            ].filter(async (transaction) => {
                const transactionExists = await db.mappedTransaction.findFirst({
                    where: {
                        moneyMoneyId: transaction.imported_id,
                    },
                });

                return !transactionExists;
            });

            task.output = `Importing ${transactionsToImport.length} transactions to Actual account '${actualAccount.name}'...`;

            if (
                !!config.openAIApiKey &&
                !isDryRun &&
                transactionsToImport.length > 0
            ) {
                task.output = `Cleaning up payee names for ${transactionsToImport.length} transaction/s using OpenAI...`;
                const payeeTransformer = new PayeeTransformer();

                const transactionPayees = transactionsToImport.map(
                    (t) => t.imported_payee as string
                );
                const transformedPayees =
                    await payeeTransformer.transformPayees(transactionPayees);

                if (transformedPayees !== null) {
                    transactionsToImport.forEach((t, i) => {
                        t.payee_name =
                            transformedPayees[t.imported_payee as string];
                    });
                } else {
                    task.output =
                        'Payee transformation failed. Using default payee names...';
                    transactionsToImport.forEach((t, i) => {
                        t.payee_name = t.imported_payee;
                    });
                }
            } else {
                transactionsToImport.forEach((t, i) => {
                    t.payee_name = t.imported_payee;
                });
            }

            if (!isDryRun) {
                await actualApi.addTransactions(
                    actualAccount.id,
                    transactionsToImport
                );

                for (const transaction of transactionsToImport) {
                    await db.mappedTransaction.create({
                        data: {
                            moneyMoneyId: transaction.imported_id as string,
                            actualId: actualAccount.id,
                            budgetSyncId: actualFile.syncId,
                        },
                    });
                }
            }

            task.output = `Transaction map for Actual account [${actualAccount.id}] updated.`;
        }

        const mappedAccounts = await db.mappedAccount.findMany({
            where: {
                budgetSyncId: actualFile.syncId,
            },
        });

        const accountsWithoutTransactions = monMonAccounts.filter(
            (account) =>
                !accountTransactionMap[account.uuid] &&
                mappedAccounts.some((acc) => acc.moneyMoneyId === account.uuid)
        );

        task.output = `Found ${accountsWithoutTransactions.length} accounts without transactions:`;
        for (const account of accountsWithoutTransactions) {
            task.output = `- ${account.name} (${account.uuid})`;
        }

        if (accountsWithoutTransactions.length > 0) {
            task.output = 'Creating starting balance transactions...';

            for (const account of accountsWithoutTransactions) {
                const mappedAccount = await db.mappedAccount.findUnique({
                    where: {
                        moneyMoneyId: account.uuid,
                    },
                });

                if (!mappedAccount?.actualId) {
                    task.output = `No Actual account found for MoneyMoney account [${account.uuid}]. Skipping...`;
                    continue;
                }

                const actualAccountId = mappedAccount.actualId;

                if (!actualAccountId) {
                    task.output = `No Actual account found for MoneyMoney account [${account.uuid}]. Skipping...`;

                    continue;
                }

                const existingTransactions =
                    await actualApi.getTransactions(actualAccountId);

                if (existingTransactions.length > 0) {
                    task.output = `Actual account [${actualAccountId}] already has transactions. Skipping...`;

                    continue;
                }

                const monMonAccountBalance = account.balance[0][0];
                const startingBalance = Math.round(monMonAccountBalance * 100);

                const startTransactionId = `${account.uuid}-start`;
                const startTransaction: CreateTransaction = {
                    date: format(new Date(), 'yyyy-MM-dd'),
                    amount: startingBalance,
                    imported_id: startTransactionId,
                    cleared: true,
                    notes: 'Starting balance',
                };

                const mappedStartTransaction =
                    await db.mappedTransaction.findFirst({
                        where: {
                            moneyMoneyId: startTransactionId,
                        },
                    });

                if (mappedStartTransaction) {
                    task.output = `Starting balance already exists, skipping...`;
                    continue;
                }

                task.output = `Creating starting balance of ${startTransaction.amount} for Actual account '${actualAccountId}'`;

                if (!isDryRun) {
                    await actualApi.addTransactions(actualAccountId, [
                        startTransaction,
                    ]);

                    await db.mappedTransaction.create({
                        data: {
                            moneyMoneyId: startTransactionId,
                            actualId: actualAccountId,
                            budgetSyncId: actualFile.syncId,
                        },
                    });
                }
            }
        }

        if (!isDryRun) {
            await db.budgetConfig.update({
                where: {
                    syncId,
                },
                data: {
                    lastImportedAt: new Date(),
                },
            });
        }
    }

    private async convertToActualTransaction(
        transaction: MonMonTransaction
    ): Promise<CreateTransaction> {
        const previousTransactionWithSameImportedPayee =
            await actualApi.getTransactionsByImportedPayee(transaction.name);

        return {
            date: format(transaction.valueDate, 'yyyy-MM-dd'),
            amount: Math.round(transaction.amount * 100),
            imported_id: `${transaction.accountUuid}-${transaction.id}`,
            imported_payee: transaction.name,
            cleared: transaction.booked,
            notes: transaction.purpose,
            // payee_name: transaction.name,
        };
    }
}

const importer = new Importer();
export default importer;
