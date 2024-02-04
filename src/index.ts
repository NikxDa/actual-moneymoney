import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import importCommand from './commands/import.command.js';
import budgetCommand from './commands/budget.command.js';
import setupCommand from './commands/setup.command.js';

dotenv.config();

const yargsParser = yargs(hideBin(process.argv))
    .command(importCommand())
    .command(setupCommand())
    .command(budgetCommand());

const { argv } = yargsParser;
