import actual from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import util from 'node:util';

import { ActualServerConfig } from './config.js';
import Logger from './Logger.js';
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

const isActualNoise = (args: unknown[]) => {
    if (args.length === 0) {
        return false;
    }

    const message = util.format(...(args as [unknown, ...unknown[]]));

    return message.startsWith('Got messages from server');
};
const suppressIfNoisy =
    <TArgs extends unknown[]>(original: (...args: TArgs) => void) =>
    (...args: TArgs) => {
        if (isActualNoise(args)) {
            return;
        }

        original(...args);
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
            return await actual.getAccounts();
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
            await actual.downloadBudget(
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
            actual.importTransactions(accountId, transactions, {
                defaultCleared: false,
            })
        );
    }

    getTransactions(accountId: string, options?: { from?: Date; to?: Date }) {
        const startDate = format(
            options?.from ?? new Date(2000, 0, 1),
            'yyyy-MM-dd'
        );
        const endDate = format(options?.to ?? new Date(), 'yyyy-MM-dd');

        return this.suppressConsoleLog(() =>
            actual.getTransactions(accountId, startDate, endDate)
        );
    }

    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        await this.suppressConsoleLog(() => actual.shutdown());
        this.isInitialized = false;
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
        const originalConsoleInfo = console.info;
        const originalConsoleDebug = console.debug;

        console.log = suppressIfNoisy(originalConsoleLog.bind(console));
        console.info = suppressIfNoisy(originalConsoleInfo.bind(console));
        console.debug = suppressIfNoisy(originalConsoleDebug.bind(console));

        try {
            return await callback();
        } finally {
            console.log = originalConsoleLog;
            console.info = originalConsoleInfo;
            console.debug = originalConsoleDebug;
        }
    }
}

export default ActualApi;
