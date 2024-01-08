import actual from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import FileService from '../services/FileService.js';
import { Account as MonMonAccount } from 'moneymoney';
import { Cache, Config } from './types.js';

type ActualApiParams = {
    dataDir: string;
    serverURL: string;
    password: string;
    syncID: string;
};

type ActualApiDependencies = {
    cache: FileService<Cache>;
    config: FileService<Config>;
};

type ActualApiConstructor = {
    params: ActualApiParams;
    dependencies: ActualApiDependencies;
};

class ActualApi {
    private params: ActualApiParams;
    private cache: FileService<Cache>;
    private config: FileService<Config>;

    constructor({ params, dependencies }: ActualApiConstructor) {
        this.params = params;
        this.cache = dependencies.cache;
        this.config = dependencies.config;
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

    async sync() {
        await actual.internal.send('sync');
    }

    async getAccounts() {
        await this.ensureInitialization();
        const accounts = await actual.methods.getAccounts();
        return accounts;
    }

    async createAccountFromMoneyMoney(account: MonMonAccount) {
        const createdAccountId = await actual.methods.createAccount(
            {
                name: account.name,
                type: 'checking',
                closed: false,
            },
            0
        );

        return createdAccountId;
    }

    addTransactions(accountId: string, transactions: CreateTransaction[]) {
        return actual.methods.addTransactions(accountId, transactions);
    }

    getTransactions(accountId: string) {
        const startDate = format(new Date(2000, 1, 1), 'yyyy-MM-dd');
        const endDate = format(new Date(), 'yyyy-MM-dd');

        return actual.methods.getTransactions(accountId, startDate, endDate);
    }

    async getTransactionsByImportedPayee(payee: string) {
        const queryBuilder = (actual.methods as any).q;
        const runQuery = (actual.methods as any).runQuery;

        const query = queryBuilder('transactions')
            .filter({
                imported_payee: payee,
            })
            .select(['category']);

        const { data } = await runQuery(query);
        // console.log(data);

        return data;
    }
}

export default ActualApi;
