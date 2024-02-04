import actual from '@actual-app/api';
import { format } from 'date-fns';
import fs from 'fs/promises';
import { Account as MonMonAccount } from 'moneymoney';
import { Cache, Config } from './types.js';
import prompts from 'prompts';
import db from './db.js';
import prisma from '@prisma/client';
import path from 'path';
import { getConfig } from './config.js';

class ActualApi {
    private config: prisma.Config | null = null;

    protected isInitialized = false;

    async init() {
        if (this.isInitialized) {
            return;
        }

        this.config = await getConfig();

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
            serverURL: this.config.actualServerUrl,
            password: this.config.actualServerPassword,
        });

        const actualFiles = await db.budget.findMany();

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
}

const actualApi = new ActualApi();
export default actualApi;
