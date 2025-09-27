import toml from 'toml';
import { z } from 'zod';
import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import path from 'node:path';
import fs from 'node:fs/promises';
import Logger, { LogLevel } from '../utils/Logger.js';
import { configSchema, getConfigFile } from '../utils/config.js';
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
            const targetDirectory = path.dirname(configPath);

            logger.debug(
                `Ensuring configuration directory exists: ${targetDirectory}`
            );
            try {
                await fs.mkdir(targetDirectory, { recursive: true });
            } catch (mkdirError) {
                const mkdirMessage =
                    mkdirError instanceof Error
                        ? mkdirError.message
                        : String(mkdirError);
                logger.error('Failed to create configuration directory.', [
                    `Path: ${targetDirectory}`,
                    `Reason: ${mkdirMessage}`,
                ]);
                throw mkdirError;
            }

            logger.debug('Writing default configuration template...');
            try {
                await fs.writeFile(configPath, EXAMPLE_CONFIG, {
                    encoding: 'utf-8',
                    mode: 0o600,
                });
            } catch (writeError) {
                const writeMessage =
                    writeError instanceof Error
                        ? writeError.message
                        : String(writeError);
                logger.error('Failed to create configuration file.', [
                    `Path: ${configPath}`,
                    `Reason: ${writeMessage}`,
                ]);
                throw writeError;
            }

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
} as CommandModule<ArgumentsCamelCase>;
