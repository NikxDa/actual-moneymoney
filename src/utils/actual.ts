import actual from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import { Account as MonMonAccount } from 'moneymoney';
import prompts from 'prompts';
import db from './db.js';
import prisma from '@prisma/client';
import path from 'path';
import { getConfig } from './config.js';
import fetch from 'node-fetch';

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

    async init() {
        if (this.isInitialized) {
            return;
        }

        const config = await getConfig();

        const actualDataDir = path.resolve(
            process.env.ACTUAL_DATA_DIR ?? './actual-data'
        );

        const dataDirExists = await fs
            .access(actualDataDir)
            .then(() => true)
            .catch(() => false);

        if (!dataDirExists) {
            await fs.mkdir(actualDataDir, { recursive: true });
        }

        await actual.init({
            dataDir: actualDataDir,
            serverURL: config.actualServerUrl,
            password: config.actualServerPassword,
        });

        const actualFiles = await db.budgetConfig.findMany();

        for (const actualFile of actualFiles) {
            await actual.methods.downloadBudget(
                actualFile.syncId,
                actualFile.e2ePassword
                    ? {
                          password: actualFile.e2ePassword,
                      }
                    : undefined
            );
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

    async shutdown() {
        await actual.shutdown();
    }

    private async getUserToken() {
        const config = await getConfig();

        if (config.userToken) {
            return config.userToken;
        }

        const response = await fetch(
            `${config.actualServerUrl}/account/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    password: config.actualServerPassword,
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

        await db.config.update({
            where: {
                id: 1,
            },
            data: {
                userToken,
            },
        });

        return userToken;
    }

    async getUserFiles() {
        const config = await getConfig();
        const userToken = await this.getUserToken();

        const response = await fetch(
            `${config.actualServerUrl}/sync/list-user-files`,
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

const actualApi = new ActualApi();
export default actualApi;
