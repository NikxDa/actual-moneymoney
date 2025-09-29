#!/usr/bin/env node

import yargs, { type Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';

import fs from 'fs';
import importCommand from './commands/import.command.js';
import validateCommand from './commands/validate.command.js';
import Logger, { LogLevel } from './utils/Logger.js';
import { APPLICATION_DIRECTORY } from './utils/shared.js';

try {
    fs.accessSync(APPLICATION_DIRECTORY);
} catch (_err) {
    fs.mkdirSync(APPLICATION_DIRECTORY, { recursive: true });
}

const logLevelEnumValues = Object.values(LogLevel).filter((value): value is number => typeof value === 'number');
const minLogLevel = Math.min(...logLevelEnumValues);
const maxLogLevel = Math.max(...logLevelEnumValues);

let structuredLogsEnabled = false;

const parser: Argv<unknown> = yargs(hideBin(process.argv))
    .option('config', {
        type: 'string',
        description: 'Path to the configuration file',
    })
    .option('logLevel', {
        type: 'number',
        description: 'The log level to use (0-3)',
    })
    .option('structuredLogs', {
        type: 'boolean',
        description: 'Emit structured JSON logs instead of coloured text output',
    })
    .coerce('logLevel', (value: unknown): number | null | undefined => {
        if (value === undefined || value === null) {
            return value;
        }

        const numericValue = typeof value === 'number' ? value : Number.parseInt(String(value), 10);

        if (!Number.isFinite(numericValue)) {
            throw new Error(`--logLevel must be a finite number. Values are clamped to ${minLogLevel}-${maxLogLevel}.`);
        }

        const clampedValue = Math.min(Math.max(numericValue, minLogLevel), maxLogLevel);

        return Math.trunc(clampedValue);
    })
    .command(importCommand)
    .command(validateCommand)
    .middleware((argv) => {
        structuredLogsEnabled = Boolean(argv.structuredLogs);
    })
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
    if (!structuredLogsEnabled) {
        const rawArgs = process.argv.slice(2);
        const flagNames = ['--structuredLogs', '--structured-logs'] as const;
        const parseBoolean = (value: string): boolean | undefined => {
            const normalisedValue = value.trim().toLowerCase();

            if (normalisedValue === 'true') {
                return true;
            }

            if (normalisedValue === 'false') {
                return false;
            }

            return undefined;
        };

        for (let index = 0; index < rawArgs.length; index += 1) {
            const arg = rawArgs[index];

            if (arg === undefined) {
                continue;
            }

            const matchingFlag = flagNames.find((flag) => arg === flag || arg.startsWith(`${flag}=`));

            if (!matchingFlag) {
                continue;
            }

            let parsedValue: boolean | undefined;

            if (arg.includes('=')) {
                const [, value = ''] = arg.split('=', 2);
                parsedValue = parseBoolean(value) ?? true;
            } else {
                const nextArg = rawArgs[index + 1];

                if (nextArg !== undefined && !nextArg.startsWith('-')) {
                    parsedValue = parseBoolean(nextArg) ?? true;
                } else {
                    parsedValue = true;
                }
            }

            structuredLogsEnabled = parsedValue;
            break;
        }
    }

    const logger = new Logger(LogLevel.INFO, {
        structuredLogs: structuredLogsEnabled,
    });

    if (error instanceof Error) {
        logger.error(error.message);
    } else {
        logger.error(String(error));
    }

    process.exitCode = 1;
});
