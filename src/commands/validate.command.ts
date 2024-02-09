import { ArgumentsCamelCase, CommandModule } from 'yargs';
import { configSchema, getConfig, getConfigFile } from '../utils/config.js';
import fs from 'fs/promises';
import Logger, { LogLevel } from '../utils/Logger.js';
import { z } from 'zod';
import { EXAMPLE_CONFIG } from '../utils/shared.js';

const handleValidate = async (argv: ArgumentsCamelCase) => {
    const configPath = await getConfigFile(argv);

    const logLevel = (argv.logLevel || LogLevel.INFO) as number;
    const logger = new Logger(logLevel);

    logger.info(`Current configuration file: ${configPath}`);

    const configFileExists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);

    if (!configFileExists) {
        // Create path to file and file itself if it doesn't exist
        await fs.writeFile(configPath, EXAMPLE_CONFIG);

        logger.warn('Configuration file not found.');
        logger.info(
            `Created default configuration file at: ${configPath}. Please edit it with your preferred settings.`
        );

        process.exit(0);
    } else {
        const config = await getConfig(argv);

        logger.info('Validating configuration...');

        try {
            configSchema.parse(config);
        } catch (e) {
            if (e instanceof z.ZodError) {
                logger.error('Configuration file is invalid:');
                for (const error of e.errors) {
                    logger.error(
                        `Path [${error.path.join('.')}]: ${error.message}`
                    );
                }
            } else {
                logger.error(`An unexpected error occured: ${e}`);
            }

            process.exit(1);
        }

        logger.info('Configuration file is valid.');
    }
};

export default {
    command: 'validate',
    describe: 'View information about and validate the current configuration',
    handler: handleValidate,
} as CommandModule;
