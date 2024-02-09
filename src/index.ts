#!/usr/bin/env node

import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import importCommand from './commands/import.command.js';
import validateCommand from './commands/validate.command.js';
import { APPLICATION_DIRECTORY } from './utils/shared.js';
import fs from 'fs/promises';

dotenv.config();

async function main() {
    const appDirExists = await fs
        .access(APPLICATION_DIRECTORY)
        .then(() => true)
        .catch(() => false);

    if (!appDirExists) {
        await fs.mkdir(APPLICATION_DIRECTORY, { recursive: true });
    }
}

const yargsParser = yargs(hideBin(process.argv))
    .option('config', {
        type: 'string',
        description: 'Path to the configuration file',
    })
    .option('verbose', {
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging',
    })
    .command(importCommand)
    .command(validateCommand);

const { argv } = yargsParser;
