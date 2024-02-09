import path from 'path';
import toml from 'toml';
import fs from 'fs/promises';
import { ArgumentsCamelCase } from 'yargs';
import { DEFAULT_CONFIG_FILE } from './shared.js';

type StorageConfig = {
    database: string;
    actualDataDir: string;
};

type PayeeTransformationConfig = {
    enabled: boolean;
    openAiApiKey: string;
};

type ImportConfig = {
    importUncheckedTransactions: boolean;
};

export type ActualServerConfig = {
    serverUrl: string;
    serverPassword: string;
    budgets: Array<ActualBudgetConfig>;
};

export type ActualBudgetConfig = {
    syncId: string;
    e2eEncryption: {
        enabled: boolean;
        password: string;
    };
    accountMapping: Record<string, string>;
};

export type Config = {
    storage: StorageConfig;
    payeeTransformation: PayeeTransformationConfig;
    import: ImportConfig;
    actualServers: Array<ActualServerConfig>;
};

export const getConfigFile = (argv: ArgumentsCamelCase) => {
    if (argv.config) {
        const argvConfigFile = path.resolve(argv.config as string);
        return argvConfigFile;
    }

    return DEFAULT_CONFIG_FILE;
};

export const getConfig = async (argv: ArgumentsCamelCase) => {
    const configFile = getConfigFile(argv);

    const configFileExists = await fs
        .access(configFile)
        .then(() => true)
        .catch(() => false);

    if (!configFileExists) {
        throw new Error(
            `Config file not found: '${configFile}'. Create it or use the --config option to specify a different path.`
        );
    }

    const configContent = await fs.readFile(configFile, 'utf-8');
    const config = toml.parse(configContent) as Config;

    return config;
};
