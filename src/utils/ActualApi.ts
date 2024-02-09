import actual from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import { ActualServerConfig, Config, getConfig } from './config.js';
import fetch from 'node-fetch';
import { DEFAULT_DATA_DIR } from './shared.js';

type UserFile = {
    deleted: number;
    encryptKeyId: null;
    fileId: string;
    groupId: string;
    name: string;
};

type GetUserFilesResponse = {
    status: string;
    data: Array<UserFile>;
};

class ActualApi {
    protected isInitialized = false;

    constructor(
        private serverConfig: ActualServerConfig,
        private config: Config
    ) {}

    async init() {
        if (this.isInitialized) {
            return;
        }

        const actualDataDir =
            this.config.storage.actualDataDir ?? DEFAULT_DATA_DIR;

        const dataDirExists = await fs
            .access(actualDataDir)
            .then(() => true)
            .catch(() => false);

        if (!dataDirExists) {
            await fs.mkdir(actualDataDir, { recursive: true });
        }

        await actual.init({
            dataDir: actualDataDir,
            serverURL: this.serverConfig.serverUrl,
            password: this.serverConfig.serverPassword,
        });

        for (const actualServer of this.config.actualServers) {
            for (const budgetConfig of actualServer.budgets) {
                await actual.methods.downloadBudget(
                    budgetConfig.syncId,
                    budgetConfig.e2eEncryption.enabled
                        ? {
                              password: budgetConfig.e2eEncryption.password,
                          }
                        : undefined
                );
            }
        }

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

        return data;
    }

    async shutdown() {
        await actual.shutdown();
    }

    private async getUserToken() {
        const response = await fetch(
            `${this.serverConfig.serverUrl}/account/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    password: this.serverConfig.serverPassword,
                }),
            }
        );

        const responseData = (await response.json()) as {
            data: { token: string | null };
        };

        const userToken = responseData.data?.token;

        if (!userToken) {
            throw new Error(
                'Could not get user token: Invalid server password.'
            );
        }

        return userToken;
    }

    async getUserFiles() {
        const userToken = await this.getUserToken();

        const response = await fetch(
            `${this.serverConfig.serverUrl}/sync/list-user-files`,
            {
                headers: {
                    'X-Actual-Token': userToken,
                },
            }
        );

        const responseData = (await response.json()) as GetUserFilesResponse;

        return responseData.data.filter((f) => f.deleted === 0);
    }
}

export default ActualApi;
