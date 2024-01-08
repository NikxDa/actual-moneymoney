import fs from 'fs/promises';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import envPaths from '../utils/envPaths.js';

class FileService<T> {
    private db: Low<T>;
    private file: string;
    private fileExists: boolean = false;

    constructor(filePath: string, defaultValue: T) {
        this.file = path.resolve(filePath);

        this.db = new Low<T>(new JSONFile<T>(this.file), defaultValue);
    }

    private async ensureFileExists() {
        if (this.fileExists) {
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

        this.fileExists = true;
    }

    public async load() {
        await this.ensureFileExists();
        await this.db.read();
    }

    public async save() {
        await this.ensureFileExists();
        await this.db.write();
    }

    get data() {
        return this.db.data;
    }
}

export default FileService;
