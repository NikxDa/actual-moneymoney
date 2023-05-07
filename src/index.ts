import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import importCommand from './commands/import.command.js';
import setupCommand from './commands/setup.command.js';
import Database from './utils/db.js';

dotenv.config();

if (typeof process.env.DATA_DIR !== 'string') {
    throw new Error('DATA_DIR environment variable is not set');
}

const database = new Database();

const yargsParser = yargs(hideBin(process.argv))
    .command(importCommand(database))
    .command(setupCommand(database))

    .boolean('verbose')
    .alias('v', 'verbose')
    .describe('verbose', 'Enable verbose logging');

const { argv } = yargsParser;
