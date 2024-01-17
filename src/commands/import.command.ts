import { format, parse, sub, subMonths } from 'date-fns';
import path from 'path';
import { CommandModule } from 'yargs';
import { SharedDependencies } from '../index.js';
import ActualApi from '../utils/ActualApi.js';
import Importer from '../utils/Importer.js';
import envPaths from '../utils/envPaths.js';
import { DATE_FORMAT } from '../utils/shared.js';
import { Listr, SimpleRenderer } from 'listr2';

const handleCommand = async (dependencies: SharedDependencies, argv: any) => {
    const { config, cache } = dependencies;

    const isDryRun = (argv.dryRun as boolean) || false;
    const fromDate = argv.from
        ? parse(argv.from as string, DATE_FORMAT, new Date())
        : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
        console.log(
            `Invalid from date: '${argv.from}'. Expected a date in the format: ${DATE_FORMAT}`
        );
    }

    await config.load();
    await cache.load();

    const isSetupComplete =
        config.data.actualApi.password !== '' &&
        config.data.actualApi.serverURL !== '' &&
        config.data.actualApi.syncID !== '';

    if (!isSetupComplete) {
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
            enableAIPayeeTransformation: config.data.useAIPayeeTransformation,
            openaiApiKey: config.data.openaiApiKey,
        },
        dependencies: {
            ...dependencies,
            actualApi,
        },
    });

    const tasks = new Listr(
        [
            {
                title: 'Import accounts',
                task: async (ctx, task) => {
                    await importer.importAccounts(isDryRun, task);
                },
            },
            {
                title: 'Import transactions',
                task: async (ctx, task) => {
                    await importer.importTransactions({
                        from: fromDate,
                        isDryRun,
                        task,
                    });
                },
            },
            {
                title: 'Import complete!',
                task: () => {},
            },
        ],
        {
            renderer: SimpleRenderer,
        }
    );

    await tasks.run();

    await config.save();
    await cache.save();

    process.exit();
};

export default (dependencies: SharedDependencies) => {
    return {
        command: 'import',
        describe: 'Import data from MoneyMoney',
        builder: (yargs) => {
            return yargs
                .boolean('dry-run')
                .describe('dry-run', 'Do not import data')
                .string('from')
                .describe(
                    'from',
                    `Import transactions on or after this date (${DATE_FORMAT})`
                );
        },
        handler: (argv) => handleCommand(dependencies, argv),
    } as CommandModule;
};
