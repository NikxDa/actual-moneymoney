import db from './db.js';

export const getConfig = async () => {
    const config = await db.config.findFirst();

    if (!config) {
        throw new Error(
            "The application is not configured. Please run 'setup' first."
        );
    }

    return config;
};
