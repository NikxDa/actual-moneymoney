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
    const logLevel = (argv.logLevel ?? LogLevel.INFO) as number;
    const logger = new Logger(logLevel);

    const config = await getConfig(argv, { logger });

    const payeeTransformer = config.payeeTransformation.enabled
        ? new PayeeTransformer(config.payeeTransformation, logger)
        : undefined;

    if (config.actualServers.length === 0) {
        throw new Error(
            'No Actual servers configured. Refer to the docs on how to a new server with in the configuration file.'
        );
    }

    const isDryRun = Boolean(argv['dry-run'] ?? argv.dryRun);
    const fromDate = argv.from
        ? parse(argv.from as string, DATE_FORMAT, new Date())
        : undefined;
    const toDate = argv.to
        ? parse(argv.to as string, DATE_FORMAT, new Date())
        : undefined;
    const server = argv.server as string | Array<string> | undefined;
    const account = argv.account as string | Array<string> | undefined;
    const budget = argv.budget as string | Array<string> | undefined;

    const serverUrls = server
        ? Array.isArray(server)
            ? server
            : [server]
        : undefined;

    let accountRefs: Array<string> | undefined;
    if (account) {
        accountRefs = Array.isArray(account) ? account : [account];
    }

    const budgetSyncIds = budget
        ? Array.isArray(budget)
            ? budget
            : [budget]
        : undefined;

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

    try {
        logger.debug(`Checking MoneyMoney database access...`);
        const isUnlocked = await checkDatabaseUnlocked();
        if (!isUnlocked) {
            throw new Error(
                `MoneyMoney database is locked. Please unlock it and try again.`
            );
        }
        logger.debug(`MoneyMoney database is accessible.`);
    } catch (error) {
        logger.error(
            `Failed to access MoneyMoney database: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        throw error;
    }

    const serversToProcess = serverUrls
        ? config.actualServers.filter((serverConfig) =>
              serverUrls.includes(serverConfig.serverUrl)
          )
        : config.actualServers;

    if (serverUrls && serverUrls.length > 0) {
        const configuredServerUrls = new Set(
            config.actualServers.map((serverConfig) => serverConfig.serverUrl)
        );
        const missingServers = serverUrls.filter(
            (url) => !configuredServerUrls.has(url)
        );

        if (missingServers.length > 0) {
            const missingList = missingServers.join(', ');
            throw new Error(
                `Server${missingServers.length > 1 ? 's' : ''} not found in configuration: ${missingList}`
            );
        }
    }

    if (serversToProcess.length === 0) {
        throw new Error(
            'No Actual servers matched the provided filters. Check your configuration or adjust the --server flag.'
        );
    }

    if (budgetSyncIds && budgetSyncIds.length > 0) {
        const configuredBudgets = new Set(
            serversToProcess.flatMap((serverConfig) =>
                serverConfig.budgets.map((b) => b.syncId)
            )
        );
        const missingBudgets = budgetSyncIds.filter(
            (syncId) => !configuredBudgets.has(syncId)
        );

        if (missingBudgets.length > 0) {
            const missingList = missingBudgets.join(', ');
            throw new Error(
                `Budget${missingBudgets.length > 1 ? 's' : ''} not found in configuration: ${missingList}`
            );
        }
    }

    for (const serverConfig of serversToProcess) {
        const budgetsToProcess = budgetSyncIds
            ? serverConfig.budgets.filter((budgetConfig) =>
                  budgetSyncIds.includes(budgetConfig.syncId)
              )
            : serverConfig.budgets;

        if (budgetsToProcess.length === 0) {
            continue;
        }

        logger.debug(`Creating Actual API instance...`, [
            `Server URL: ${serverConfig.serverUrl}`,
        ]);
        const actualApi = new ActualApi(serverConfig, logger);

        try {
            logger.debug(`Initializing Actual API...`);
            await actualApi.init();

            for (const budgetConfig of budgetsToProcess) {
                logger.debug(
                    `Loading budget...`,
                    `Budget: ${budgetConfig.syncId}`
                );
                await actualApi.loadBudget(budgetConfig.syncId);

                logger.debug(`Loading accounts...`);
                const accountMap = new AccountMap(
                    budgetConfig,
                    logger,
                    actualApi
                );
                await accountMap.loadFromConfig();

                const importer = new Importer(
                    config,
                    budgetConfig,
                    actualApi,
                    logger,
                    accountMap,
                    payeeTransformer
                );

                if (isDryRun) {
                    logger.info(
                        `DRY RUN MODE - Importing transactions (no changes will be made)...`,
                        `Budget: ${budgetConfig.syncId}`
                    );
                } else {
                    logger.info(
                        `Importing transactions...`,
                        `Budget: ${budgetConfig.syncId}`
                    );
                }

                await importer.importTransactions({
                    accountRefs,
                    from: fromDate,
                    to: toDate,
                    isDryRun,
                });
            }
        } finally {
            try {
                logger.debug(
                    `Shutting down Actual API instance...`,
                    `Server URL: ${serverConfig.serverUrl}`
                );
                await actualApi.shutdown();
            } catch (error) {
                logger.warn(
                    `Failed to shut down Actual API cleanly: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`
                );
            }
        }
    }

    return;
};

export default {
    command: 'import',
    describe: 'Import data from MoneyMoney',
    builder: (yargs) => {
        return yargs
            .option('dry-run', {
                type: 'boolean',
                describe: 'Do not import data',
            })
            .alias('dry-run', 'dryRun')
            .string('server')
            .describe(
                'server',
                'Import only budgets configured for the specified Actual server URL'
            )
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
                'to',
                `Import transactions up to this date (${DATE_FORMAT})`
            );
    },
    handler: (argv) => handleCommand(argv),
} as CommandModule;
