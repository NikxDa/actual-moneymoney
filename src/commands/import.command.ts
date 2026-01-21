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
import { applyScope, Scope } from '../utils/scope.js';

const handleCommand = async (argv: ArgumentsCamelCase) => {
    const logLevel = (argv.logLevel || LogLevel.INFO) as number;
    const logger = new Logger(logLevel);

    const scope: Scope = {
        servers: argv.server as Array<string> | undefined,
        budgets: argv.budget as Array<string> | undefined,
        accounts: argv.account as Array<string> | undefined,
    };

    const fullConfig = await getConfig(argv);

    if (fullConfig.actualServers.length === 0) {
        throw new Error(
            'No Actual servers configured. Refer to the docs on how to a new server with in the configuration file.'
        );
    }

    const config = applyScope(fullConfig, scope);

    if (config.actualServers.length === 0) {
        logger.info('Nothing to import for the given filters.');
        return;
    }

    const scopeSummary = [
        `Servers: ${scope.servers?.join(', ') || 'ALL'}`,
        `Budgets: ${scope.budgets?.join(', ') || 'ALL'}`,
        `Accounts: ${scope.accounts?.join(', ') || 'ALL'}`,
    ];
    logger.info('Import scope:', scopeSummary);

    const payeeTransformer = config.payeeTransformation.enabled
        ? new PayeeTransformer(config.payeeTransformation, logger)
        : undefined;

    const isDryRun = (argv.dryRun as boolean) || false;
    const fromDate = argv.from
        ? parse(argv.from as string, DATE_FORMAT, new Date())
        : undefined;
    const toDate = argv.to
        ? parse(argv.to as string, DATE_FORMAT, new Date())
        : undefined;
    const accountRefs = scope.accounts;

    if (fromDate && isNaN(fromDate.getTime())) {
        throw new Error(
            `Invalid 'from' date: '${argv.from}'. Expected a date in the format: ${DATE_FORMAT}`
        );
    }

    if (toDate && isNaN(toDate.getTime())) {
        throw new Error(
            `Invalid 'to' date: '${argv.to}'. Expected a date in the format: ${DATE_FORMAT}`
        );
    }

    for (const serverConfig of config.actualServers) {
        logger.debug(`Checking MoneyMoney database access...`);
        const isUnlocked = await checkDatabaseUnlocked();
        if (!isUnlocked) {
            throw new Error(
                `MoneyMoney database is locked. Please unlock it and try again.`
            );
        }
        logger.debug(`MoneyMoney database is accessible.`);

        for (const budgetConfig of serverConfig.budgets) {
            logger.debug(`Creating Actual API instance...`, [
                `Server URL: ${serverConfig.serverUrl}`,
                `Budget: ${budgetConfig.syncId}`,
            ]);
            const actualApi = new ActualApi(serverConfig, logger);

            logger.debug(`Initializing Actual API...`);
            await actualApi.init();

            logger.debug(`Loading budget...`, `Budget: ${budgetConfig.syncId}`);
            await actualApi.loadBudget(budgetConfig.syncId);

            logger.debug(`Loading accounts...`);
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
            .string('from')
            .describe(
                'from',
                `Import transactions on or after this date (${DATE_FORMAT})`
            )
            .string('to')
            .describe(
                'to',
                `Import transactions up to this date (${DATE_FORMAT})`
            )
            .option('server', {
                alias: 's',
                type: 'string',
                array: true,
                description: 'Limit to server name(s)',
            })
            .option('budget', {
                alias: 'b',
                type: 'string',
                array: true,
                description: 'Limit to budget id/name(s)',
            })
            .option('account', {
                alias: 'a',
                type: 'string',
                array: true,
                description: 'Limit to account name(s)',
            });
    },
    handler: (argv) => handleCommand(argv),
} as CommandModule;
