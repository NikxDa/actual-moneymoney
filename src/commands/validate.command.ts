import { ArgumentsCamelCase, CommandModule } from 'yargs';
import { getConfig, getConfigFile } from '../utils/config.js';
import fs from 'fs/promises';
import Logger, { LogLevel } from '../utils/Logger.js';

const handleValidate = async (argv: ArgumentsCamelCase) => {
    const configPath = await getConfigFile(argv);

    const isVerbose = argv.verbose as boolean;
    const logger = new Logger(isVerbose ? LogLevel.DEBUG : LogLevel.INFO);

    logger.info(`Current configuration file: ${configPath}`);

    const configFileExists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);

    if (!configFileExists) {
        // Create path to file and file itself if it doesn't exist
        await fs.writeFile(configPath, '');
        console.log(
            `Created empty configuration file at: ${configPath}. Please edit it with your preferred settings.`
        );
        process.exit(0);
    } else {
        const config = await getConfig(argv);
        console.log('Current configuration:');
        console.log(
            `Storage: ${config.storage.database} at ${config.storage.actualDataDir}`
        );
        console.log(
            `Payee transformation: ${
                config.payeeTransformation.enabled ? 'enabled' : 'disabled'
            }`
        );
        console.log(
            `Import unchecked transactions: ${
                config.import.importUncheckedTransactions
                    ? 'enabled'
                    : 'disabled'
            }`
        );
        console.log('Actual servers:');
        for (const server of config.actualServers) {
            console.log(`- ${server.serverUrl}`);
        }
    }
};

export default {
    command: 'validate',
    describe: 'View information about and validate the current configuration',
    handler: handleValidate,
} as CommandModule;
