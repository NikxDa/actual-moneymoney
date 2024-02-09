import os from 'os';
import path from 'path';

export const DATE_FORMAT = 'yyyy-MM-dd';

export const APPLICATION_DIRECTORY = path.resolve(os.homedir(), '.actually');

export const DEFAULT_DATA_DIR = path.resolve(
    APPLICATION_DIRECTORY,
    'actual-data'
);

export const DEFAULT_CONFIG_FILE = path.resolve(
    APPLICATION_DIRECTORY,
    'config.toml'
);

export const DEFAULT_CACHE_FILE = path.resolve(
    APPLICATION_DIRECTORY,
    'cache.json'
);
