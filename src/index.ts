#!/usr/bin/env node

import fs from 'fs';
import yargs, { Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import importCommand from './commands/import.command.js';
import validateCommand from './commands/validate.command.js';
import Logger, { LogLevel } from './utils/Logger.js';
import { APPLICATION_DIRECTORY } from './utils/shared.js';

try {
    fs.accessSync(APPLICATION_DIRECTORY);
} catch (_err) {
    fs.mkdirSync(APPLICATION_DIRECTORY, { recursive: true });
}

const parser: Argv<unknown> = yargs(hideBin(process.argv))
    .option('config', {
        type: 'string',
        description: 'Path to the configuration file',
    })
    .option('logLevel', {
        type: 'number',
        description: 'The log level to use (0-3)',
    })
    .coerce('logLevel', (value) => {
        if (value === undefined || value === null) {
            return value;
        }

        const numericValue =
            typeof value === 'number'
                ? value
                : Number.parseInt(String(value), 10);

        if (!Number.isFinite(numericValue)) {
            throw new Error(
                '--logLevel must be a number between 0 (error) and 3 (debug).'
            );
        }

        const clampedValue = Math.min(
            Math.max(numericValue, LogLevel.ERROR),
            LogLevel.DEBUG
        );

        return Math.trunc(clampedValue);
    })
    .command(importCommand)
    .command(validateCommand)
    .showHelpOnFail(false)
    .fail((msg, err) => {
        if (err) {
            throw err;
        }

        throw new Error(msg);
    });

const run = async (): Promise<void> => {
    await parser.parseAsync();
};

run().catch((error: unknown) => {
    const logger = new Logger();

    if (error instanceof Error) {
        logger.error(error.message);
    } else {
        logger.error(String(error));
    }

    process.exitCode = 1;
});
