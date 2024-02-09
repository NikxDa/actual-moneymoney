import { ArgumentsCamelCase, CommandModule } from 'yargs';
import { configSchema, getConfig, getConfigFile } from '../utils/config.js';
import fs from 'fs/promises';
import Logger, { LogLevel } from '../utils/Logger.js';
import { ZodIssueCode, z } from 'zod';
import { EXAMPLE_CONFIG } from '../utils/shared.js';

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
        await fs.writeFile(configPath, EXAMPLE_CONFIG);

        console.log(
            `Created empty configuration file at: ${configPath}. Please edit it with your preferred settings.`
        );
        process.exit(0);
    } else {
        const config = await getConfig(argv);

        console.log('Validating configuration...');

        try {
            configSchema.parse(config);
        } catch (e) {
            if (e instanceof z.ZodError) {
                console.error('Configuration file is invalid:');
                for (const error of e.errors) {
                    console.error(
                        `Path [${error.path.join('.')}]:`,
                        error.message
                    );
                }
            } else {
                console.error('An unexpected error occured:', e);
            }

            process.exit(1);
        }

        console.log('Configuration file is valid.');
    }
};

export default {
    command: 'validate',
    describe: 'View information about and validate the current configuration',
    handler: handleValidate,
} as CommandModule;
