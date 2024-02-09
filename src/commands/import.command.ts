import { parse } from 'date-fns';
import { CommandModule } from 'yargs';
import { DATE_FORMAT } from '../utils/shared.js';
import { checkDatabaseUnlocked } from 'moneymoney';
import Importer from '../utils/Importer.js';
import { getConfig } from '../utils/config.js';
import ActualApi from '../utils/ActualApi.js';
import PayeeTransformer from '../utils/PayeeTransformer.js';
import Logger, { LogLevel } from '../utils/Logger.js';

const handleCommand = async (argv: any) => {
    const config = await getConfig(argv);
    const budgetToImport = argv.budgetName;

    const isVerbose = argv.verbose as boolean;

    const logger = new Logger(isVerbose ? LogLevel.DEBUG : LogLevel.INFO);

    const payeeTransformer = config.payeeTransformation.enabled
        ? new PayeeTransformer(config.payeeTransformation.openAiApiKey)
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

    if (fromDate && isNaN(fromDate.getTime())) {
        throw new Error(
            `Invalid from date: '${argv.from}'. Expected a date in the format: ${DATE_FORMAT}`
        );
    }

    for (const serverConfig of config.actualServers) {
        const actualApi = new ActualApi(serverConfig, config);

        logger.debug(
            `Connecting to Actual server at ${serverConfig.serverUrl}...`
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
            const importer = new Importer(
                budgetConfig,
                actualApi,
                logger,
                payeeTransformer
            );

            logger.info(
                `Importing accounts for budget: ${budgetConfig.syncId}`
            );

            const accountMapping = await importer.parseAccountMapping();

            logger.info(
                `Importing transactions for budget: ${budgetConfig.syncId}`
            );
            await importer.importTransactions({
                accountMapping,
                from: fromDate,
                isDryRun,
            });

            if (!isDryRun) {
                await actualApi.shutdown();
            }
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
            );
    },
    handler: (argv) => handleCommand(argv),
} as CommandModule;
