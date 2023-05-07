import fs from 'fs/promises';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import envPaths from '../utils/envPaths.js';

type Config = {
    actualApi: {
        serverURL: string;
        password: string;
        syncID: string;
    };
};

class ConfigService {
    private db: Low<Config>;
    private configFile: string;
    private configExists: boolean = false;

    constructor() {
        this.configFile = path.resolve(
            path.join(envPaths.config, 'config.json')
        );

        const defaultConfig: Config = {
            actualApi: {
                serverURL: '',
                password: '',
                syncID: '',
            },
        };

        this.db = new Low<Config>(
            new JSONFile<Config>(this.configFile),
            defaultConfig
        );
    }

    private async ensureConfigExists() {
        if (this.configExists) {
            return;
        }

        const configPath = path.dirname(this.configFile);

        // Ensure path exists
        const pathExists = await fs
            .access(configPath)
            .then(() => true)
            .catch(() => false);

        if (!pathExists) {
            await fs.mkdir(configPath, { recursive: true });
        }

        this.configExists = true;
    }

    public async load() {
        await this.ensureConfigExists();
        await this.db.read();
    }

    public async save() {
        await this.ensureConfigExists();
        await this.db.write();
    }

    get data() {
        return this.db.data;
    }

    async isConfigurationComplete() {
        await this.ensureConfigExists();
        await this.db.read();

        const { actualApi } = this.db.data;

        return (
            actualApi.serverURL !== '' &&
            actualApi.password !== '' &&
            actualApi.syncID !== ''
        );
    }
}

export default ConfigService;
