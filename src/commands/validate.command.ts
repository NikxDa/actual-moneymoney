import toml from 'toml';
import { ArgumentsCamelCase, CommandModule } from 'yargs';
import { configSchema, getConfigFile } from '../utils/config.js';
import fs from 'fs/promises';
import Logger, { LogLevel } from '../utils/Logger.js';
import { z } from 'zod';
import { EXAMPLE_CONFIG } from '../utils/shared.js';

const handleValidate = async (argv: ArgumentsCamelCase) => {
    const configPath = await getConfigFile(argv);

    const logLevel = (argv.logLevel || LogLevel.INFO) as number;
    const logger = new Logger(logLevel);

    logger.info(`Current configuration file: ${configPath}`);

    let configContent: string;
    try {
        logger.debug(`Reading configuration file...`);
        configContent = await fs.readFile(configPath, 'utf-8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // Create path to file and file itself if it doesn't exist
            await fs.writeFile(configPath, EXAMPLE_CONFIG);

            logger.warn('Configuration file not found.');
            logger.info(
                `Created default configuration file at: ${configPath}. Please edit it with your preferred settings.`
            );

            return;
        }
        throw error;
    }

    logger.info('Validating configuration...');

    try {
        logger.debug(`Parsing configuration file...`);
        const configData = toml.parse(configContent);

        logger.debug(`Parsing configuration schema...`);
        configSchema.parse(configData);
    } catch (e) {
        if (e instanceof z.ZodError) {
            logger.error('Configuration file is invalid:');
            for (const issue of e.issues) {
                const path = issue.path.length
                    ? issue.path.join('.')
                    : '<root>';
                logger.error(
                    `Code ${issue.code} at path [${path}]: ${issue.message}`
                );
            }
        } else if (e instanceof Error && e.name === 'SyntaxError') {
            const line = 'line' in e ? e.line : -1;
            const column = 'column' in e ? e.column : -1;

            logger.error(
                `Failed to parse configuration file: ${e.message} (line ${line}, column ${column})`
            );
        } else {
            logger.error(`An unexpected error occurred: ${e}`);
        }

        if (e instanceof Error) {
            throw e;
        }

        throw new Error(`Configuration validation failed: ${String(e)}`);
    }

    logger.info('Configuration file is valid.');
};

export default {
    command: 'validate',
    describe: 'View information about and validate the current configuration',
    handler: handleValidate,
} as CommandModule;
