import actual from '@actual-app/api';
import type { CreateTransaction } from '@actual-app/api';
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
    <TArgs extends unknown[]>(
        original: (...args: TArgs) => void
    ): ((...args: TArgs) => void) =>
    (...args: TArgs): void => {
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
        let from = options?.from ?? new Date(2000, 0, 1);
        let to = options?.to ?? null;
        if (to && from > to) {
            [from, to] = [to, from];
        }
        const startDate = format(from, 'yyyy-MM-dd');
        const endDate = to ? format(to, 'yyyy-MM-dd') : null;

        return this.suppressConsoleLog(() =>
            endDate
                ? actual.getTransactions(accountId, startDate, endDate)
                : actual.getTransactions(accountId, startDate)
        );
    }

    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        try {
            await this.suppressConsoleLog(() => actual.shutdown());
        } finally {
            this.isInitialized = false;
        }
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

    private static suppressDepth = 0;
    private static originals: {
        log: typeof console.log;
        info: typeof console.info;
        debug: typeof console.debug;
        warn: typeof console.warn;
    } | null = null;

    private async suppressConsoleLog<T>(
        callback: () => T | Promise<T>
    ): Promise<Awaited<T>> {
        if (ActualApi.suppressDepth === 0) {
            ActualApi.originals = {
                log: console.log,
                info: console.info,
                debug: console.debug,
                warn: console.warn,
            };

            const originals = ActualApi.originals;

            console.log = suppressIfNoisy(
                (...args: Parameters<typeof console.log>) => {
                    originals.log.apply(console, args);
                }
            );
            console.info = suppressIfNoisy(
                (...args: Parameters<typeof console.info>) => {
                    originals.info.apply(console, args);
                }
            );
            console.debug = suppressIfNoisy(
                (...args: Parameters<typeof console.debug>) => {
                    originals.debug.apply(console, args);
                }
            );
            console.warn = suppressIfNoisy(
                (...args: Parameters<typeof console.warn>) => {
                    originals.warn.apply(console, args);
                }
            );
        }

        ActualApi.suppressDepth++;
        try {
            return await callback();
        } finally {
            ActualApi.suppressDepth--;
            if (ActualApi.suppressDepth === 0 && ActualApi.originals) {
                console.log = ActualApi.originals.log;
                console.info = ActualApi.originals.info;
                console.debug = ActualApi.originals.debug;
                console.warn = ActualApi.originals.warn;
                ActualApi.originals = null;
            }
        }
    }
}

export default ActualApi;
