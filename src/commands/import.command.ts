import { sub } from 'date-fns';
import path from 'path';
import { CommandModule } from 'yargs';
import { SharedDependencies } from '../index.js';
import ActualApi from '../utils/ActualApi.js';
import Importer from '../utils/Importer.js';
import envPaths from '../utils/envPaths.js';

const handleCommand = async (dependencies: SharedDependencies, argv: any) => {
    const { config } = dependencies;

    const isDryRun = (argv.dryRun as boolean) || false;
    const isContinuous = (argv.continuous as boolean) || false;

    await config.load();

    if (!(await config.isConfigurationComplete())) {
        console.log('Please run `setup` first to configure the application.');
        return;
    }

    const actualDataDir = path.resolve(path.join(envPaths.data, 'actual'));

    const actualApi = new ActualApi({
        params: {
            ...config.data.actualApi,
            dataDir: actualDataDir,
        },
        dependencies,
    });

    const importer = new Importer({
        params: {
            enableAIPayeeTransformation: true,
        },
        dependencies: {
            ...dependencies,
            actualApi,
        },
    });

    console.log('Importing accounts...');
    await importer.importAccounts(isDryRun);

    console.log('Importing transactions...');
    const fromDate = sub(new Date(), { months: 1 });
    await importer.importTransactions({ from: fromDate, isDryRun });

    console.log('Done importing data from MoneyMoney.');
};

export default (dependencies: SharedDependencies) => {
    return {
        command: 'import',
        describe: 'Import data from MoneyMoney',
        builder: (yargs) => {
            return yargs
                .boolean('dry-run')
                .describe('dry-run', 'Do not import data')
                .boolean('continuous')
                .describe('continuous', 'Run in continuous mode');
        },
        handler: (argv) => handleCommand(dependencies, argv),
    } as CommandModule;
};
