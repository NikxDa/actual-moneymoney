import appRootPath from 'app-root-path';
import fs from 'fs/promises';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';

type Config = {
    actualApi: {
        serverURL: string;
        password: string;
        syncID: string;
    };
    importCache: {
        accountMap: {
            [key: string]: string;
        };
        transactionMap: {
            [key: string]: boolean;
        };
    };
    setupComplete: boolean;
};

class Database {
    private db: Low<Config>;
    public data: Config;
    private configFile: string;

    constructor() {
        this.configFile = path.resolve(
            path.join(
                appRootPath.path,
                process.env.DATA_DIR as string,
                'db.json'
            )
        );

        const defaultConfig: Config = {
            actualApi: {
                serverURL: '',
                password: '',
                syncID: '',
            },
            importCache: {
                accountMap: {},
                transactionMap: {},
            },
            setupComplete: false,
        };

        this.db = new Low<Config>(
            new JSONFile<Config>(this.configFile),
            defaultConfig
        );

        this.data = this.db.data;
    }

    private async ensureConfigExists() {
        const configPath = path.dirname(this.configFile);

        // Ensure path exists
        const pathExists = await fs
            .access(configPath)
            .then(() => true)
            .catch(() => false);

        if (!pathExists) {
            await fs.mkdir(configPath, { recursive: true });
        }
    }

    async write() {
        await this.ensureConfigExists();
        this.db.data = this.data;
        await this.db.write();
    }

    async read() {
        await this.ensureConfigExists();
        await this.db.read();
        this.data = this.db.data;
    }
}

export default Database;
