import fs from 'fs/promises';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import envPaths from '../utils/envPaths.js';

type Cache = {
    accountMap: {
        [key: string]: string;
    };
    importedTransactions: string[];
};

class CacheService {
    private db: Low<Cache>;
    private cacheFile: string;
    private cacheExists: boolean = false;

    constructor() {
        this.cacheFile = path.resolve(path.join(envPaths.cache, 'cache.json'));

        const defaultCache: Cache = {
            accountMap: {},
            importedTransactions: [],
        };

        this.db = new Low<Cache>(
            new JSONFile<Cache>(this.cacheFile),
            defaultCache
        );
    }

    private async ensureCacheExists() {
        if (this.cacheExists) {
            return;
        }

        // Ensure path exists
        const pathExists = await fs
            .access(envPaths.cache)
            .then(() => true)
            .catch(() => false);

        if (!pathExists) {
            await fs.mkdir(envPaths.cache, { recursive: true });
        }

        this.cacheExists = true;
    }

    public async load() {
        await this.ensureCacheExists();
        await this.db.read();
    }

    public async save() {
        await this.ensureCacheExists();
        await this.db.write();
    }

    get data() {
        return this.db.data;
    }
}

export default CacheService;
