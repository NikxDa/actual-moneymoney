import { parse } from 'date-fns';
import { checkDatabaseUnlocked } from 'moneymoney';
import { ArgumentsCamelCase, CommandModule } from 'yargs';
import { AccountMap } from '../utils/AccountMap.js';
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
    const toDate = argv.to
        ? parse(argv.to as string, DATE_FORMAT, new Date())
        : undefined;
    const account = argv.account as string | Array<string> | undefined;

    let accountRefs: Array<string> | undefined;
    if (account) {
        accountRefs = Array.isArray(account) ? account : [account];
    }

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

            const accountMap = new AccountMap(budgetConfig, logger, actualApi);
            await accountMap.loadFromConfig();

            const importer = new Importer(
                config,
                budgetConfig,
                actualApi,
                logger,
                accountMap,
                payeeTransformer
            );

            logger.info(
                `Importing accounts...`,
                `Budget: ${budgetConfig.syncId}`
            );

            logger.info(
                `Importing transactions...`,
                `Budget: ${budgetConfig.syncId}`
            );

            await importer.importTransactions({
                accountRefs,
                from: fromDate,
                to: toDate,
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
            .string('account')
            .describe(
                'account',
                'Import only transactions from the specified MoneyMoney account identifier'
            )
            .string('budget')
            .describe(
                'budget',
                'Import only to the specified Actual budget identifier'
            )
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
