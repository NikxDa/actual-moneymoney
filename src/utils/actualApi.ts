import actual from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import { default as Database } from './db.js';
import { MonMonAccount, MonMonTransaction } from './moneyMoneyApi.js';

type ActualApiParams = {
    dataDir: string;
    serverURL: string;
    password: string;
    syncID: string;
};

type ActualApiDependencies = {
    database: Database;
};

type ActualApiConstructor = ActualApiParams & ActualApiDependencies;

class ActualApi {
    private params: ActualApiParams;
    private database: Database;

    constructor({ database, ...params }: ActualApiConstructor) {
        this.params = params;
        this.database = database;
    }

    protected isInitialized = false;

    async init() {
        if (this.isInitialized) {
            return;
        }

        const dataDirExists = await fs
            .access(this.params.dataDir)
            .then(() => true)
            .catch(() => false);

        if (!dataDirExists) {
            await fs.mkdir(this.params.dataDir, { recursive: true });
        }

        await actual.init({
            dataDir: this.params.dataDir,
            serverURL: this.params.serverURL,
            password: this.params.password,
        });

        await actual.methods.downloadBudget(this.params.syncID);

        this.isInitialized = true;
    }

    async ensureInitialization() {
        if (!this.isInitialized) {
            await this.init();
        }
    }

    async importMoneyMoneyAccounts(accounts: MonMonAccount[]) {
        await this.ensureInitialization();

        console.log('Starting account import...');

        const actualAccounts = await actual.methods.getAccounts();

        console.log(`Found ${actualAccounts.length} accounts in Actual.`);

        const previouslyImportedAccounts = Object.keys(
            this.database.data.importCache.accountMap
        );

        const accountsToCreate = accounts.filter(
            (account) =>
                account.accountNumber &&
                account.accountNumber.length > 0 &&
                !previouslyImportedAccounts.includes(account.uuid)
        );

        console.log(`Found ${accountsToCreate.length} missing accounts.`);

        for (const account of accountsToCreate) {
            const createdAccountId = await actual.methods.createAccount(
                {
                    name: account.name,
                    type: 'checking',
                    closed: false,
                },
                0
            );

            this.database.data.importCache.accountMap[account.uuid] =
                createdAccountId;

            console.log(`Created account ${account.name}.`);
        }

        console.log('Account import successful.');

        await this.database.write();
        await actual.internal.send('sync');
    }

    async importMoneyMoneyTransactions(
        transactions: MonMonTransaction[],
        accounts: MonMonAccount[]
    ) {
        await this.ensureInitialization();

        console.log('Starting transaction import...');

        const transactionsByAccount = transactions.reduce(
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
            transactionsByAccount
        )) {
            const actualAccountId =
                this.database.data.importCache.accountMap[accountUuid];

            if (!actualAccountId) {
                console.log(
                    `No Actual account found for MoneyMoney account [${accountUuid}]. Skipping...`
                );
                continue;
            }

            const monMonAccount = accounts.find(
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
                date: format(transactions[0].valueDate, 'yyyy-MM-dd'),
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

            const previouslyImportedTransactionIds = Object.keys(
                this.database.data.importCache.transactionMap
            );

            const transactionsToImport = [
                ...expenseTransactions,
                startTransaction,
            ].filter(
                (transaction) =>
                    !previouslyImportedTransactionIds.includes(
                        transaction.imported_id as string
                    )
            );

            console.log(
                `Importing ${transactionsToImport.length} transactions to Actual account [${actualAccountId}]...`
            );

            await actual.methods.addTransactions(
                actualAccountId,
                transactionsToImport
            );

            for (let i = 0; i < transactionsToImport.length; i++) {
                const transaction = transactionsToImport[i];

                this.database.data.importCache.transactionMap[
                    transaction.imported_id as string
                ] = true;
            }

            console.log(
                `Transaction map for Actual account [${actualAccountId}] updated.`
            );
        }

        await actual.internal.send('sync');

        console.log('Transaction import complete.');
    }
}

export default ActualApi;
