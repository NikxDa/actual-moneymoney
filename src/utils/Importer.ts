import { format, parse, subMonths } from 'date-fns';
import CacheService from '../services/FileService.js';
import ActualApi from './ActualApi.js';
import PayeeTransformer from './PayeeTransformer.js';
import { Cache, ParamsAndDependencies } from './types.js';
import {
    Transaction as MonMonTransaction,
    getAccounts,
    getTransactions,
} from 'moneymoney';
import FileService from '../services/FileService.js';
import {
    Listr,
    ListrSimpleRenderer,
    ListrTask,
    ListrTaskWrapper,
} from 'listr2';
import { DATE_FORMAT } from './shared.js';
import prompts from 'prompts';

type ImporterParams = {
    enableAIPayeeTransformation: boolean;
    openaiApiKey?: string;
};

type ImporterDependencies = {
    cache: FileService<Cache>;
    actualApi: ActualApi;
};

class Importer {
    private params: ImporterParams;
    private cache: FileService<Cache>;
    private actualApi: ActualApi;

    constructor({
        params,
        dependencies,
    }: ParamsAndDependencies<ImporterParams, ImporterDependencies>) {
        this.params = params;
        Object.assign(this, dependencies);

        if (
            this.params.enableAIPayeeTransformation &&
            !this.params.openaiApiKey
        ) {
            throw new Error(
                'AI payee name transformation was enabled, but no API key was provided. Run setup again to set your OpenAI API key.'
            );
        }
    }

    async importAccounts(
        isDryRun = false,
        task: ListrTaskWrapper<any, ListrSimpleRenderer, ListrSimpleRenderer>
    ) {
        const moneyMoneyAccounts = await getAccounts();
        task.output = `Found ${moneyMoneyAccounts.length} accounts in MoneyMoney.`;

        const actualAccounts = await this.actualApi.getAccounts();
        task.output = `Found ${actualAccounts.length} accounts in Actual.`;

        const previouslyImportedAccounts = Object.keys(
            this.cache.data.accountMap
        );

        const accountsToCreate = moneyMoneyAccounts.filter(
            (account) =>
                account.accountNumber &&
                account.accountNumber.length > 0 &&
                !previouslyImportedAccounts.includes(account.uuid)
        );

        task.output = `Creating ${accountsToCreate.length} account(s) that weren't previously imported.`;

        let mappedActualAccounts = Object.values(this.cache.data.accountMap);

        for (const account of accountsToCreate) {
            const accountPrompt = await prompts([
                {
                    name: 'mapToAccount',
                    type: 'select',
                    message: `Please pick the Actual account that corresponds to the MoneyMoney account '${account.name}':`,
                    choices: [
                        ...actualAccounts
                            .filter(
                                (acc) => !mappedActualAccounts.includes(acc.id)
                            )
                            .map((acc) => ({
                                title: acc.name,
                                description: `Map the MoneyMoney account '${account.name}' to this account`,
                                value: acc.id,
                            })),
                        {
                            title: 'None / Create new account',
                            description:
                                'Create a new account in Actual instead of mapping to an existing account',
                            value: 'none',
                        },
                    ],
                },
            ]);

            if (accountPrompt.mapToAccount === 'none') {
                task.output = `Creating new Actual account for MoneyMoney account '${account.name}'...`;

                if (!isDryRun) {
                    const createdAccountId =
                        await this.actualApi.createAccountFromMoneyMoney(
                            account
                        );

                    this.cache.data.accountMap[account.uuid] = createdAccountId;
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
                    this.cache.data.accountMap[account.uuid] = actualAccount.id;
                }

                mappedActualAccounts = [
                    ...mappedActualAccounts,
                    actualAccount.id,
                ];
            }
        }

        if (!isDryRun) {
            await this.actualApi.sync();
        }
    }

    async importTransactions({
        from,
        isDryRun = false,
        task,
    }: {
        from?: Date;
        isDryRun?: boolean;
        task: ListrTaskWrapper<any, ListrSimpleRenderer, ListrSimpleRenderer>;
    }) {
        const monMonAccounts = await getAccounts();
        task.output = `Found ${monMonAccounts.length} accounts in MoneyMoney`;

        const actualAccounts = await this.actualApi.getAccounts();

        const lastImportDate = this.cache.data.lastImportDate
            ? parse(this.cache.data.lastImportDate, 'yyyy-MM-dd', new Date())
            : null;

        const fromDate = from ?? lastImportDate ?? subMonths(new Date(), 1);

        const transactions = await getTransactions({
            from: fromDate,
        });

        task.output = `Found ${
            transactions.length
        } total transactions in MoneyMoney since ${format(
            fromDate,
            DATE_FORMAT
        )}`;

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
            const actualAccountId = this.cache.data.accountMap[accountUuid];
            const actualAccount = actualAccounts.find(
                (acc) => acc.id === actualAccountId
            );

            if (!actualAccountId || !actualAccount) {
                task.output = `No Actual account found for MoneyMoney account [${accountUuid}]. Skipping...`;
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

            const existingTransactions = await this.actualApi.getTransactions(
                actualAccountId
            );

            task.output = `Found ${existingTransactions.length} existing transactions for Actual account '${actualAccount.name}'`;

            const transactionsToImport = [
                ...expenseTransactions,
                ...(existingTransactions.length > 0 ? [] : [startTransaction]),
            ].filter((transaction) => {
                const transactionExists =
                    this.cache.data.importedTransactions.includes(
                        transaction.imported_id as string
                    );

                return !transactionExists;
            });

            task.output = `Importing ${transactionsToImport.length} transactions to Actual account '${actualAccount.name}'...`;

            if (
                this.params.enableAIPayeeTransformation &&
                !isDryRun &&
                transactionsToImport.length > 0
            ) {
                task.output = 'Transforming payee names...';
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
                    task.output = 'Payee transformation failed. Continuing...';
                }
            }

            if (!isDryRun) {
                await this.actualApi.addTransactions(
                    actualAccountId,
                    transactionsToImport
                );

                this.cache.data.importedTransactions.push(
                    ...transactionsToImport.map((t) => t.imported_id as string)
                );
            }

            task.output = `Transaction map for Actual account [${actualAccountId}] updated.`;
        }

        const accountsWithoutTransactions = monMonAccounts.filter(
            (account) =>
                !accountTransactionMap[account.uuid] &&
                this.cache.data.accountMap[account.uuid]
        );

        task.output = `Found ${accountsWithoutTransactions.length} accounts without transactions:`;
        for (const account of accountsWithoutTransactions) {
            task.output = `- ${account.name} (${account.uuid})`;
        }

        if (accountsWithoutTransactions.length > 0) {
            task.output = 'Creating starting balance transactions...';

            for (const account of accountsWithoutTransactions) {
                const actualAccountId =
                    this.cache.data.accountMap[account.uuid];

                if (!actualAccountId) {
                    task.output = `No Actual account found for MoneyMoney account [${account.uuid}]. Skipping...`;

                    continue;
                }

                const existingTransactions =
                    await this.actualApi.getTransactions(actualAccountId);

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

                if (
                    this.cache.data.importedTransactions.includes(
                        startTransactionId
                    )
                ) {
                    task.output = `Starting balance already exists, skipping...`;
                    continue;
                }

                task.output = `Creating starting balance of ${startTransaction.amount} for Actual account '${actualAccountId}'`;

                if (!isDryRun) {
                    await this.actualApi.addTransactions(actualAccountId, [
                        startTransaction,
                    ]);

                    this.cache.data.importedTransactions.push(
                        startTransactionId
                    );
                }
            }
        }

        if (!isDryRun) {
            this.cache.data.lastImportDate = format(new Date(), DATE_FORMAT);
        }

        await this.actualApi.sync();
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
            imported_id: `${transaction.accountUuid}-${transaction.id}`,
            imported_payee: transaction.name,
            cleared: transaction.booked,
            notes: transaction.purpose,
            // payee_name: transaction.name,
        };
    }
}

export default Importer;
