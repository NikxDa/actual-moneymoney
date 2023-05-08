import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import importCommand from './commands/import.command.js';
import setupCommand from './commands/setup.command.js';
import CacheService from './services/CacheService.js';
import ConfigService from './services/ConfigService.js';
import MoneyMoneyApi from './utils/MoneyMoneyApi.js';

dotenv.config();

const config = new ConfigService();
const cache = new CacheService();
const moneyMoneyApi = new MoneyMoneyApi();

// moneyMoneyApi.getCategories();

export type SharedDependencies = {
    config: ConfigService;
    cache: CacheService;
    moneyMoneyApi: MoneyMoneyApi;
};

const sharedDependencies = {
    config,
    cache,
    moneyMoneyApi,
};

const yargsParser = yargs(hideBin(process.argv))
    .command(importCommand(sharedDependencies))
    .command(setupCommand(sharedDependencies))

    .boolean('verbose')
    .alias('v', 'verbose')
    .describe('verbose', 'Enable verbose logging');

const { argv } = yargsParser;
