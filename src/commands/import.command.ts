import { format, parse, sub, subMonths } from 'date-fns';
import path from 'path';
import { CommandModule } from 'yargs';
import { SharedDependencies } from '../index.js';
import ActualApi from '../utils/ActualApi.js';
import Importer from '../utils/Importer.js';
import envPaths from '../utils/envPaths.js';
import { DATE_FORMAT } from '../utils/shared.js';
import { DefaultRenderer, Listr, ListrRenderer, SimpleRenderer } from 'listr2';
import { checkDatabaseUnlocked } from 'moneymoney';
import prompts from 'prompts';

const handleCommand = async (dependencies: SharedDependencies, argv: any) => {
    const { config, cache } = dependencies;

    const isDryRun = (argv.dryRun as boolean) || false;
    const fromDate = argv.from
        ? parse(argv.from as string, DATE_FORMAT, new Date())
        : undefined;
    const verbose = argv.verbose as boolean;
    let e2ePassword = argv.e2ePassword as string | undefined;

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

    const shouldQueryPassword =
        config.data.actualApi.encryptionEnabled && !e2ePassword;

    const passwordPrompt = await prompts({
        type: shouldQueryPassword ? 'password' : null,
        name: 'password',
        message: 'Enter your end-to-end encryption password:',
    });

    if (shouldQueryPassword && !passwordPrompt.password) {
        console.log('No E2E password entered. Aborting.');
        process.exit();
    } else {
        e2ePassword = passwordPrompt.password;
    }

    const tasks = new Listr(
        [
            {
                title: 'Check connection',
                task: async (ctx, task) => {
                    task.output = `Connecting to Actual...`;

                    await actualApi.init(e2ePassword);
                    task.output = `Connection to Actual established.`;
                    task.output = `Checking MoneyMoney database access...`;
                    const isUnlocked = await checkDatabaseUnlocked();
                    if (!isUnlocked) {
                        throw new Error(
                            `MoneyMoney database is locked. Please unlock it and try again.`
                        );
                    }
                    task.output = `MoneyMoney database is accessible.`;
                },
            },
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
                title: 'Syncing data',
                task: async () => {
                    if (!isDryRun) {
                        await actualApi.shutdown();
                    }
                },
            },
        ],
        {
            renderer: verbose ? SimpleRenderer : DefaultRenderer,
        }
    );

    await tasks.run().catch((e) => null);

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
                )
                .boolean('verbose')
                .describe('verbose', 'Show verbose output')
                .default('verbose', false)
                .string('e2e-password')
                .describe('e2e-password', 'End-to-end encryption password');
        },
        handler: (argv) => handleCommand(dependencies, argv),
    } as CommandModule;
};
