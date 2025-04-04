import { parse } from 'date-fns';
import { checkDatabaseUnlocked } from 'moneymoney';
import { ArgumentsCamelCase, CommandModule } from 'yargs';
import ActualApi from '../utils/ActualApi.js';
import Importer from '../utils/Importer.js';
import Logger, { LogLevel } from '../utils/Logger.js';
import PayeeTransformer from '../utils/PayeeTransformer.js';
import { getConfig } from '../utils/config.js';
import { DATE_FORMAT } from '../utils/shared.js';

const handleCommand = async (argv: ArgumentsCamelCase) => {
    const config = await getConfig(argv);

    const logLevel = (argv.logLevel || LogLevel.INFO) as number;
    const logger = new Logger(logLevel);

    const payeeTransformer =
        config.payeeTransformation.enabled &&
        config.payeeTransformation.openAiApiKey
            ? new PayeeTransformer({
                  openAiApiKey: config.payeeTransformation.openAiApiKey,
                  openAiModel: config.payeeTransformation.openAiModel,
              })
            : undefined;

    if (config.actualServers.length === 0) {
        throw new Error(
            'No Actual servers configured. Refer to the docs on how to a new server with in the configuration file.'
        );
    }

    const isDryRun = (argv.dryRun as boolean) || false;
    const fromDate = argv.from
        ? parse(argv.from as string, DATE_FORMAT, new Date())
        : undefined;
    const toDate = argv.to
        ? parse(argv.to as string, DATE_FORMAT, new Date())
        : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
        throw new Error(
            `Invalid from date: '${argv.from}'. Expected a date in the format: ${DATE_FORMAT}`
        );
    }

    if (toDate && isNaN(toDate.getTime())) {
        throw new Error(
            `Invalid "to" date: '${argv.to}'. Expected a date in the format: ${DATE_FORMAT}`
        );
    }

    for (const serverConfig of config.actualServers) {
        const actualApi = new ActualApi(serverConfig, logger);

        logger.debug(
            `Connecting to Actual server...`,
            `Server URL: ${serverConfig.serverUrl}`
        );

        await actualApi.init();
        logger.debug(`Connection to Actual established.`);

        logger.debug(`Checking MoneyMoney database access...`);
        const isUnlocked = await checkDatabaseUnlocked();
        if (!isUnlocked) {
            throw new Error(
                `MoneyMoney database is locked. Please unlock it and try again.`
            );
        }
        logger.debug(`MoneyMoney database is accessible.`);

        for (const budgetConfig of serverConfig.budgets) {
            await actualApi.init();

            await actualApi.loadBudget(budgetConfig.syncId);

            const importer = new Importer(
                config,
                budgetConfig,
                actualApi,
                logger,
                payeeTransformer
            );

            logger.info(
                `Importing accounts...`,
                `Budget: ${budgetConfig.syncId}`
            );

            const accountMapping = await importer.parseAccountMapping();

            logger.info(
                `Importing transactions...`,
                `Budget: ${budgetConfig.syncId}`
            );

            await importer.importTransactions({
                accountMapping,
                from: fromDate,
                isDryRun,
            });

            await actualApi.shutdown();
        }
    }

    process.exit();
};

export default {
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
            .string('to')
            .describe(
                'from',
                `Import transactions up to this date (${DATE_FORMAT})`
            );
    },
    handler: (argv) => handleCommand(argv),
} as CommandModule;
