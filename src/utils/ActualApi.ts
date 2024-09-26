import actual from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import { ActualServerConfig } from './config.js';
import fetch from 'node-fetch';
import { DEFAULT_DATA_DIR } from './shared.js';
import Logger from './Logger.js';

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
    private api: typeof actual | null = null;

    constructor(
        private serverConfig: ActualServerConfig,
        private logger: Logger
    ) {}

    async init() {
        const actualDataDir = DEFAULT_DATA_DIR;

        const dataDirExists = await fs
            .access(actualDataDir)
            .then(() => true)
            .catch(() => false);

        if (!dataDirExists) {
            await fs.mkdir(actualDataDir, { recursive: true });
            this.logger.debug(
                `Created Actual data directory at ${actualDataDir}`
            );
        }

        this.logger.debug(
            `Initializing Actual instance for server ${this.serverConfig.serverUrl} with data directory ${actualDataDir}`
        );

        await this.suppressConsoleLog(async () => {
            await actual.init({
                dataDir: actualDataDir,
                serverURL: this.serverConfig.serverUrl,
                password: this.serverConfig.serverPassword,
            });
        });

        for (const budgetConfig of this.serverConfig.budgets) {
            this.logger.debug(
                `Downloading budget with syncId ${budgetConfig.syncId}...`
            );

            await this.suppressConsoleLog(async () => {
                await actual.methods.downloadBudget(
                    budgetConfig.syncId,
                    budgetConfig.e2eEncryption.enabled
                        ? {
                              password: budgetConfig.e2eEncryption.password,
                          }
                        : undefined
                );
            });
        }

        this.isInitialized = true;
    }

    async ensureInitialization() {
        if (!this.isInitialized) {
            await this.init();
        }
    }

    async sync() {
        await this.ensureInitialization();
        await this.suppressConsoleLog(async () => {
            await actual.internal.send('sync');
        });
    }

    async getAccounts() {
        await this.ensureInitialization();
        const accounts = await this.suppressConsoleLog(async () => {
            return await actual.methods.getAccounts();
        });
        return accounts;
    }

    async loadBudget(budgetId: string) {
        this.logger.debug(`Loading budget with syncId '${budgetId}'...`);

        const budgetConfig = this.serverConfig.budgets.find(
            (b) => b.syncId === budgetId
        );

        if (!budgetConfig) {
            throw new Error(`No budget with syncId '${budgetId}' found.`);
        }

        this.logger.debug(`Re-loading budget with syncId ${budgetId}...`);

        await this.suppressConsoleLog(async () => {
            await actual.methods.downloadBudget(
                budgetConfig.syncId,
                budgetConfig.e2eEncryption.enabled
                    ? {
                          password: budgetConfig.e2eEncryption.password,
                      }
                    : undefined
            );
        });
    }

    importTransactions(accountId: string, transactions: CreateTransaction[]) {
        return this.suppressConsoleLog(() =>
            actual.methods.importTransactions(accountId, transactions)
        );
    }

    getTransactions(accountId: string) {
        const startDate = format(new Date(2000, 1, 1), 'yyyy-MM-dd');
        const endDate = format(new Date(), 'yyyy-MM-dd');

        return this.suppressConsoleLog(() =>
            actual.methods.getTransactions(accountId, startDate, endDate)
        );
    }

    async shutdown() {
        await this.ensureInitialization();
        await this.suppressConsoleLog(() => actual.shutdown());
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

    private async suppressConsoleLog<T>(callback: () => T | Promise<T>) {
        const originalConsoleLog = console.log;
        console.log = () => {};

        try {
            return await callback();
        } finally {
            console.log = originalConsoleLog;
        }
    }
}

export default ActualApi;
