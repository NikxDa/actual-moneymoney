#!/usr/bin/env node

import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import importCommand from './commands/import.command.js';
import validateCommand from './commands/validate.command.js';
import Logger from './utils/Logger.js';
import { APPLICATION_DIRECTORY } from './utils/shared.js';

try {
    fs.accessSync(APPLICATION_DIRECTORY);
} catch (_err) {
    fs.mkdirSync(APPLICATION_DIRECTORY, { recursive: true });
}

const _ = yargs(hideBin(process.argv))
    .option('config', {
        type: 'string',
        description: 'Path to the configuration file',
    })
    .option('logLevel', {
        type: 'number',
        description: 'The log level to use (0-4)',
    })
    .command(importCommand)
    .command(validateCommand)
    .showHelpOnFail(false)
    .fail((msg, err) => {
        const logger = new Logger();

        if (err) {
            logger.error(err.message);
        } else {
            logger.error(msg);
        }

        process.exit(1);
    }).argv;
