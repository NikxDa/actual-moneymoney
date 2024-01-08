import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import importCommand from './commands/import.command.js';
import setupCommand from './commands/setup.command.js';
import pathsCommand from './commands/paths.command.js';
import FileService from './services/FileService.js';
import envPaths from './utils/envPaths.js';
import path from 'path';
import { Cache, Config } from './utils/types.js';

dotenv.config();

// Set up config
const configFile = path.join(envPaths.config, 'config.json');
const config = new FileService<Config>(configFile, {
    actualApi: {
        password: '',
        serverURL: '',
        syncID: '',
        encryptionEnabled: false,
    },
    useAIPayeeTransformation: false,
});

// Set up cache
const cacheFile = path.join(envPaths.cache, 'cache.json');
const cache = new FileService<Cache>(cacheFile, {
    accountMap: {},
    importedTransactions: [],
});

export type SharedDependencies = {
    config: FileService<Config>;
    cache: FileService<Cache>;
};

const sharedDependencies = {
    config,
    cache,
};

const yargsParser = yargs(hideBin(process.argv))
    .command(importCommand(sharedDependencies))
    .command(setupCommand(sharedDependencies))
    .command(pathsCommand(sharedDependencies))

    .boolean('verbose')
    .alias('v', 'verbose')
    .describe('verbose', 'Enable verbose logging');

const { argv } = yargsParser;
