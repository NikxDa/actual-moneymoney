import { format } from 'date-fns';
import CacheService from '../services/CacheService.js';
import ActualApi from './ActualApi.js';
import MoneyMoneyApi, { MonMonTransaction } from './MoneyMoneyApi.js';
import { ParamsAndDependencies } from './types.js';

type ImporterParams = {};

type ImporterDependencies = {
    cache: CacheService;
    actualApi: ActualApi;
    moneyMoneyApi: MoneyMoneyApi;
};

class Importer {
    private params: ImporterParams;
    private cache: CacheService;
    private actualApi: ActualApi;
    private moneyMoneyApi: MoneyMoneyApi;

    constructor({
        params,
        dependencies,
    }: ParamsAndDependencies<ImporterParams, ImporterDependencies>) {
        this.params = params;
        Object.assign(this, dependencies);
    }

    async importAccounts(isDryRun = false) {
        console.log('Starting account import...');

        const moneyMoneyAccounts = await this.moneyMoneyApi.getAccounts();
        const actualAccounts = await this.actualApi.getAccounts();

        console.log(
            `Found ${moneyMoneyAccounts.length} accounts in MoneyMoney.`
        );
        console.log(`Found ${actualAccounts.length} accounts in Actual.`);

        const previouslyImportedAccounts = Object.keys(this.cache);

        const accountsToCreate = moneyMoneyAccounts.filter(
            (account) =>
                account.accountNumber &&
                account.accountNumber.length > 0 &&
                !previouslyImportedAccounts.includes(account.uuid)
        );

        console.log(
            `Found ${accountsToCreate.length} accounts in MoneyMoney that weren't previously imported.`
        );

        if (isDryRun) {
            console.log('Dry run. Skipping account creation.');
            return;
        }

        for (const account of accountsToCreate) {
            const createdAccountId =
                await this.actualApi.createAccountFromMoneyMoney(account);

            this.cache.data.accountMap[account.uuid] = createdAccountId;
            console.log(`Created account ${account.name}.`);
        }

        console.log('Account import successful.');

        await this.cache.save();
        await this.actualApi.sync();
    }

    async importTransactions({
        from,
        isDryRun = false,
    }: {
        from: Date;
        isDryRun?: boolean;
    }) {
        console.log('Starting transaction import...');
        const monMonAccounts = await this.moneyMoneyApi.getAccounts();

        const transactions = await this.moneyMoneyApi.getTransactions({
            from,
        });

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

        console.log('Found transactions for the following accounts:');
        for (const [accountUuid, transactions] of Object.entries(
            accountTransactionMap
        )) {
            console.log(
                `- ${accountUuid} (${transactions.length} transactions)`
            );
        }

        if (isDryRun) {
            console.log('Dry run. Skipping transaction creation.');
            return;
        }

        for (const [accountUuid, transactions] of Object.entries(
            accountTransactionMap
        )) {
            const actualAccountId = this.cache.data.accountMap[accountUuid];

            if (!actualAccountId) {
                console.log(
                    `No Actual account found for MoneyMoney account [${accountUuid}]. Skipping...`
                );
                continue;
            }

            const monMonAccount = monMonAccounts.find(
                (account) => account.uuid === accountUuid
            );

            if (!monMonAccount) {
                console.log(
                    `No MoneyMoney account [${accountUuid}] found. Skipping...`
                );
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

            const expenseTransactions = transactions.map(
                (transaction): CreateTransaction => ({
                    date: format(transaction.valueDate, 'yyyy-MM-dd'),
                    amount: Math.round(transaction.amount * 100),
                    imported_id: `${transaction.accountUuid}-${transaction.id}`,
                    cleared: transaction.booked,
                    notes: transaction.purpose,
                    payee_name: transaction.name,
                })
            );

            const transactionsToImport = [
                ...expenseTransactions,
                startTransaction,
            ].filter(
                (transaction) =>
                    !this.cache.data.importedTransactions.includes(
                        transaction.imported_id as string
                    )
            );

            console.log(
                `Importing ${transactionsToImport.length} transactions to Actual account [${actualAccountId}]...`
            );

            await this.actualApi.addTransactions(
                actualAccountId,
                transactionsToImport
            );

            this.cache.data.importedTransactions.push(
                ...transactionsToImport.map((t) => t.imported_id as string)
            );

            console.log(
                `Transaction map for Actual account [${actualAccountId}] updated.`
            );
        }

        await this.actualApi.sync();
        console.log('Transaction import complete.');
    }
}

export default Importer;
