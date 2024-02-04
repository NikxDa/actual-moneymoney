import { format, parse, sub, subMonths } from 'date-fns';
import path from 'path';
import { CommandModule } from 'yargs';
import Importer from '../utils/Importer.js';
import { DATE_FORMAT } from '../utils/shared.js';
import { DefaultRenderer, Listr, ListrRenderer, SimpleRenderer } from 'listr2';
import { checkDatabaseUnlocked } from 'moneymoney';
import prompts from 'prompts';
import db from '../utils/db.js';
import actualApi from '../utils/actual.js';
import importer from '../utils/Importer.js';
import { getConfig } from '../utils/config.js';

const handleCommand = async (argv: any) => {
    const config = await getConfig();
    const budgetToImport = argv.budgetName;

    const actualFiles = await db.budgetConfig.findMany({
        where: {
            name: budgetToImport ?? undefined,
        },
    });

    if (actualFiles.length === 0 && budgetToImport) {
        console.log(
            `No budget configuration found with the name: '${budgetToImport}'. Check the list of configured budgets with 'budget list' or add a new budget with 'budget add'.`
        );
        return;
    } else if (actualFiles.length === 0) {
        console.log(
            `No budget configurations found. Add a new budget configuration with 'budget add'.`
        );
        return;
    }

    console.log(`Running import for ${actualFiles.length} budget(s)`);

    const isDryRun = (argv.dryRun as boolean) || false;
    const fromDate = argv.from
        ? parse(argv.from as string, DATE_FORMAT, new Date())
        : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
        console.log(
            `Invalid from date: '${argv.from}'. Expected a date in the format: ${DATE_FORMAT}`
        );
    }

    const tasks = new Listr(
        [
            {
                title: 'Check connection',
                task: async (ctx, task) => {
                    task.output = `Connecting to Actual...`;

                    await actualApi.init();
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
                    for (const actualFile of actualFiles) {
                        await importer.importAccounts(
                            actualFile.syncId,
                            isDryRun,
                            task
                        );
                    }
                },
            },
            {
                title: 'Import transactions',
                task: async (ctx, task) => {
                    for (const actualFile of actualFiles) {
                        await importer.importTransactions({
                            syncId: actualFile.syncId,
                            from: fromDate,
                            isDryRun,
                            task,
                        });
                    }
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
            renderer: SimpleRenderer,
        }
    );

    await tasks.run().catch((e) => null);

    process.exit();
};

export default () => {
    return {
        command: 'import [budgetName]',
        describe: 'Import data from MoneyMoney',
        builder: (yargs) => {
            yargs.positional('budgetName', {
                type: 'string',
                describe:
                    'The name/identifier of the budget to import. Leave empty to import all.',
            });

            return yargs
                .boolean('dry-run')
                .describe('dry-run', 'Do not import data')
                .string('from')
                .describe(
                    'from',
                    `Import transactions on or after this date (${DATE_FORMAT})`
                )
                .string('e2e-password')
                .describe('e2e-password', 'End-to-end encryption password');
        },
        handler: (argv) => handleCommand(argv),
    } as CommandModule;
};
