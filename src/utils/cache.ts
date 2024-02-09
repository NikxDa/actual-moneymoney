import fs from 'fs/promises';
import { DEFAULT_CACHE_FILE } from './shared.js';

export type Cache = {
    lastImportDate: string | null;
};

const DEFAULT_CACHE = {
    lastImportDate: null,
};

export const getCache = async (): Promise<Cache> => {
    try {
        const cache = await fs.readFile(DEFAULT_CACHE_FILE, 'utf-8');
        return JSON.parse(cache);
    } catch (e) {
        return DEFAULT_CACHE;
    }
};

export const updateCache = async (cache: Cache) => {
    await createCacheIfNotExists();
    await fs.writeFile(DEFAULT_CACHE_FILE, JSON.stringify(cache), 'utf-8');
};

export const createCacheIfNotExists = async () => {
    const cacheExists = await fs
        .access(DEFAULT_CACHE_FILE)
        .then(() => true)
        .catch(() => false);

    if (!cacheExists) {
        await fs.writeFile(
            DEFAULT_CACHE_FILE,
            JSON.stringify({ lastImportDate: null }),
            'utf-8'
        );
    }
};
