import actual from '@actual-app/api';
import fs from 'fs/promises';
import CacheService from '../services/CacheService.js';
import ConfigService from '../services/ConfigService.js';
import { MonMonAccount } from './MoneyMoneyApi.js';

type ActualApiParams = {
    dataDir: string;
    serverURL: string;
    password: string;
    syncID: string;
};

type ActualApiDependencies = {
    cache: CacheService;
    config: ConfigService;
};

type ActualApiConstructor = {
    params: ActualApiParams;
    dependencies: ActualApiDependencies;
};

class ActualApi {
    private params: ActualApiParams;
    private cache: CacheService;
    private config: ConfigService;

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
}

export default ActualApi;
