export type ParamsAndDependencies<T, D> = {
    params: T;
    dependencies: D;
};

export type Cache = {
    accountMap: {
        [key: string]: string;
    };
    importedTransactions: string[];
};

export type Config = {
    actualApi: {
        serverURL: string;
        password: string;
        syncID: string;
        encryptionEnabled: boolean;
    };
    useAIPayeeTransformation: boolean;
    openaiApiKey?: string;
};
