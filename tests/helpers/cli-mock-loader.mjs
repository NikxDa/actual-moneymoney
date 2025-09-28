const MOCK_URL_PREFIX = 'cli-mock://';
const loggerUrl = `${MOCK_URL_PREFIX}logger`;
const configUrl = `${MOCK_URL_PREFIX}config`;
const actualApiUrl = `${MOCK_URL_PREFIX}actual-api`;
const accountMapUrl = `${MOCK_URL_PREFIX}account-map`;
const importerUrl = `${MOCK_URL_PREFIX}importer`;
const payeeTransformerUrl = `${MOCK_URL_PREFIX}payee-transformer`;
const moneyMoneyUrl = `${MOCK_URL_PREFIX}moneymoney`;
const COMMON_SOURCE = `
const CONTEXT_DIR = process.env.CLI_TEST_CONTEXT_DIR;
const EVENTS_FILE = process.env.CLI_TEST_EVENTS_FILE;
if (!CONTEXT_DIR) {
    throw new Error('CLI_TEST_CONTEXT_DIR must be set for CLI integration tests.');
}
const CONTEXT_FILE = path.join(CONTEXT_DIR, 'context.json');

function readContext() {
    const raw = fs.readFileSync(CONTEXT_FILE, 'utf8');
    return JSON.parse(raw);
}

function recordEvent(event) {
    if (!EVENTS_FILE) {
        return;
    }
    const payload = JSON.stringify(event);
    fs.appendFileSync(EVENTS_FILE, payload + '\\n', 'utf8');
}

function normaliseHints(hints) {
    if (!hints) {
        return [];
    }
    return Array.isArray(hints) ? hints : [hints];
}
`;
const MODULE_SOURCES = new Map([
    [
        loggerUrl,
        `import fs from 'node:fs';
import path from 'node:path';
${COMMON_SOURCE}

const LEVELS = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

export const LogLevel = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

export default class Logger {
    constructor(level = LogLevel.INFO) {
        this.level = level;
        recordEvent({ type: 'Logger#constructor', level });
    }

    getLevel() {
        return this.level;
    }

    log(levelIndex, message, hints) {
        const levelName = LEVELS[levelIndex] ?? 'INFO';
        const hintLines = normaliseHints(hints);
        const hintSuffix = hintLines.length > 0 ? ' ' + hintLines.join(' | ') : '';
        if (levelName === 'ERROR') {
            console.error(message + hintSuffix);
        } else {
            console.log(message + hintSuffix);
        }
        recordEvent({ type: 'Logger#log', level: levelName, message, hints: hintLines });
    }

    error(message, hints) {
        this.log(LogLevel.ERROR, message, hints);
    }

    warn(message, hints) {
        if (this.level < LogLevel.WARN) {
            return;
        }
        this.log(LogLevel.WARN, message, hints);
    }

    info(message, hints) {
        if (this.level < LogLevel.INFO) {
            return;
        }
        this.log(LogLevel.INFO, message, hints);
    }

    debug(message, hints) {
        if (this.level < LogLevel.DEBUG) {
            return;
        }
        this.log(LogLevel.DEBUG, message, hints);
    }
}
`,
    ],
    [
        configUrl,
        `import fs from 'node:fs';
import path from 'node:path';
${COMMON_SOURCE}

export const DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS = 300000;
export const FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS = 45000;

export const configSchema = {
    parse() {
        throw new Error('configSchema.parse is not implemented in CLI mocks');
    },
};

export async function loadConfig(argv) {
    const context = readContext();
    return {
        config: context.config,
        defaultDecisions: context.defaultDecisions ?? [],
    };
}

export async function getConfig(argv) {
    const { config } = await loadConfig(argv);
    return config;
}

export function logDefaultedConfigDecisions(logger, decisions) {
    if (!logger || typeof logger.debug !== 'function') {
        return;
    }

    for (const decision of decisions ?? []) {
        const pathValue =
            decision && typeof decision.path === 'string'
                ? decision.path
                : String(decision?.path ?? '<unknown>');
        const valueLine = 'Value: ' + formatMockDefaultValue(decision?.value);
        const hintLines = normaliseHints(decision?.hints).map((hint) =>
            String(hint)
        );
        logger.debug('Using default configuration value.', [
            'Path: ' + pathValue,
            valueLine,
            ...hintLines,
        ]);
    }
}

function formatMockDefaultValue(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function getConfigFile() {
    const context = readContext();
    return context.configFile ?? '<mock-config>';
}
`,
    ],
    [
        actualApiUrl,
        `import fs from 'node:fs';
import path from 'node:path';
${COMMON_SOURCE}

export default class ActualApi {
    constructor(serverConfig, logger) {
        this.serverConfig = serverConfig;
        this.logger = logger;
        recordEvent({
            type: 'ActualApi#constructor',
            serverUrl: serverConfig.serverUrl,
        });
    }

    async init() {
        recordEvent({ type: 'ActualApi#init', serverUrl: this.serverConfig.serverUrl });
    }

    async loadBudget(syncId) {
        recordEvent({
            type: 'ActualApi#loadBudget',
            serverUrl: this.serverConfig.serverUrl,
            budgetSyncId: syncId,
        });
    }

    async shutdown() {
        recordEvent({ type: 'ActualApi#shutdown', serverUrl: this.serverConfig.serverUrl });
    }
}
`,
    ],
    [
        accountMapUrl,
        `import fs from 'node:fs';
import path from 'node:path';
${COMMON_SOURCE}

export class AccountMap {
    constructor(budgetConfig, logger, actualApi) {
        this.budgetConfig = budgetConfig;
        this.logger = logger;
        this.actualApi = actualApi;
        this.mapping = new Map();
        recordEvent({
            type: 'AccountMap#constructor',
            budgetSyncId: budgetConfig.syncId,
        });
    }

    async loadFromConfig() {
        recordEvent({
            type: 'AccountMap#loadFromConfig',
            budgetSyncId: this.budgetConfig.syncId,
        });
        const context = readContext();
        const failure = context.accountMap?.failures?.[this.budgetConfig.syncId];
        if (failure) {
            throw new Error(failure);
        }
        const mappingEntries = Object.entries(
            context.accountMap?.mappings?.[this.budgetConfig.syncId] ?? {}
        );
        this.mapping = new Map(mappingEntries);
    }

    getMap() {
        return this.mapping;
    }
}
`,
    ],
    [
        importerUrl,
        `import fs from 'node:fs';
import path from 'node:path';
${COMMON_SOURCE}

export default class Importer {
    constructor(config, budgetConfig, actualApi, logger, accountMap, payeeTransformer) {
        this.config = config;
        this.budgetConfig = budgetConfig;
        this.actualApi = actualApi;
        this.logger = logger;
        this.accountMap = accountMap;
        this.payeeTransformer = payeeTransformer;
        recordEvent({
            type: 'Importer#constructor',
            budgetSyncId: budgetConfig.syncId,
        });
    }

    async importTransactions(options) {
        const context = readContext();
        const importerConfig = context.importer ?? {};
        const accountRefs = options.accountRefs ?? null;
        const from = options.from instanceof Date ? options.from.toISOString() : options.from ?? null;
        const to = options.to instanceof Date ? options.to.toISOString() : options.to ?? null;
        const eventBase = {
            type: 'Importer#importTransactions',
            budgetSyncId: this.budgetConfig.syncId,
            options: {
                accountRefs,
                from,
                to,
                isDryRun: Boolean(options.isDryRun),
            },
        };

        const failureMessage =
            importerConfig.failures?.[this.budgetConfig.syncId];
        if (typeof failureMessage === 'string' && failureMessage.length > 0) {
            recordEvent({ ...eventBase, error: failureMessage });
            throw new Error(failureMessage);
        }

        if (
            importerConfig.failOnUnknownAccounts &&
            Array.isArray(options.accountRefs)
        ) {
            const knownAccounts = new Set(importerConfig.knownAccounts ?? []);
            for (const ref of options.accountRefs) {
                if (!knownAccounts.has(ref)) {
                    const errorMessage = 'Unknown account reference: ' + ref;
                    recordEvent({ ...eventBase, error: errorMessage });
                    throw new Error(errorMessage);
                }
            }
        }

        recordEvent(eventBase);
    }
}
`,
    ],
    [
        payeeTransformerUrl,
        `import fs from 'node:fs';
import path from 'node:path';
${COMMON_SOURCE}

export default class PayeeTransformer {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        recordEvent({ type: 'PayeeTransformer#constructor' });
    }
}
`,
    ],
    [
        moneyMoneyUrl,
        `import fs from 'node:fs';
import path from 'node:path';
${COMMON_SOURCE}

export async function checkDatabaseUnlocked() {
    const context = readContext();
    const locked = Boolean(context.moneyMoney?.locked);
    recordEvent({ type: 'moneymoney#checkDatabaseUnlocked', locked });
    return !locked;
}
`,
    ],
]);
export const resolve = async (specifier, context, defaultResolve) => {
    if (specifier === 'moneymoney') {
        return { url: moneyMoneyUrl, shortCircuit: true };
    }
    if (specifier.endsWith('/utils/Logger.js')) {
        return { url: loggerUrl, shortCircuit: true };
    }
    if (specifier.endsWith('/utils/config.js')) {
        return { url: configUrl, shortCircuit: true };
    }
    if (specifier.endsWith('/utils/ActualApi.js')) {
        return { url: actualApiUrl, shortCircuit: true };
    }
    if (specifier.endsWith('/utils/AccountMap.js')) {
        return { url: accountMapUrl, shortCircuit: true };
    }
    if (specifier.endsWith('/utils/Importer.js')) {
        return { url: importerUrl, shortCircuit: true };
    }
    if (specifier.endsWith('/utils/PayeeTransformer.js')) {
        return { url: payeeTransformerUrl, shortCircuit: true };
    }
    return defaultResolve(specifier, context, defaultResolve);
};
export const load = async (url, context, defaultLoad) => {
    const source = MODULE_SOURCES.get(url);
    if (source) {
        return { format: 'module', source, shortCircuit: true };
    }
    return defaultLoad(url, context, defaultLoad);
};
