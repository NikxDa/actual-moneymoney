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

const splitArgs = (values?: Array<string>): Array<string> | undefined => {
    if (!values) {
        return undefined;
    }

    const items = values
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    return items.length > 0 ? items : undefined;
};

const _ = yargs(hideBin(process.argv))
    .option('config', {
        type: 'string',
        description: 'Path to the configuration file',
    })
    .option('logLevel', {
        type: 'number',
        description: 'The log level to use (0-4)',
    })
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
    })
    .middleware((argv) => {
        const scopedArgv = argv as Record<string, unknown>;

        scopedArgv.server = splitArgs(argv.server as Array<string> | undefined);
        scopedArgv.budget = splitArgs(argv.budget as Array<string> | undefined);
        scopedArgv.account = splitArgs(argv.account as Array<string> | undefined);
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
