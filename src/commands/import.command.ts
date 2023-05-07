import appRootPath from 'app-root-path';
import path from 'path';
import { CommandModule } from 'yargs';
import ActualApi from '../utils/actualApi.js';
import Database from '../utils/db.js';
import * as moneyMoneyApi from '../utils/moneyMoneyApi.js';

const handleCommand = (database: Database) => async (argv: any) => {
    const isDryRun = (argv.dryRun as boolean) || false;
    const isContinuous = (argv.continuous as boolean) || false;

    await database.read();

    const actualDataDir = path.resolve(
        path.join(appRootPath.path, process.env.DATA_DIR as string, 'actual')
    );

    const actualApi = new ActualApi({
        serverURL: database.data.actualApi.serverURL,
        password: database.data.actualApi.password,
        syncID: database.data.actualApi.syncID,
        dataDir: actualDataDir,
        database,
    });

    console.log('Importing data from MoneyMoney...');
    const allTransactions = await moneyMoneyApi.getTransactions({
        from: new Date(2023, 1, 1),
    });

    console.log(`Found ${allTransactions.length} transactions.`);

    const allAccounts = await moneyMoneyApi.getAccounts();
    console.log(`Found ${allAccounts.length} accounts.`);

    if (isDryRun) {
        console.log('Dry run, not importing');
        return;
    }

    console.log('Importing accounts...');
    await actualApi.importMoneyMoneyAccounts(allAccounts);

    console.log('Importing transactions...');
    await actualApi.importMoneyMoneyTransactions(allTransactions, allAccounts);

    console.log('Done importing data from MoneyMoney.');
    await database.write();
};

export default (database: Database) =>
    ({
        command: 'import',
        describe: 'Import data from MoneyMoney',
        builder: (yargs) => {
            return yargs
                .boolean('dry-run')
                .describe('dry-run', 'Do not import data')
                .boolean('continuous')
                .describe('continuous', 'Run in continuous mode');
        },
        handler: handleCommand(database),
    } as CommandModule);
