export type ParamsAndDependencies<T, D> = {
    params: T;
    dependencies: D;
};

export type Cache = {
    accountMap: {
        [key: string]: string;
    };
    skippedAccounts: string[];
    importedTransactions: string[];
    lastImportDate: string | null;
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
