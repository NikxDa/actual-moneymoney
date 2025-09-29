import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArgumentsCamelCase } from 'yargs';
import {
    collectDefaultedConfigDecisions,
    configSchema,
    FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS,
    loadConfig,
    logDefaultedConfigDecisions,
} from '../src/utils/config.js';
import Logger, { LogLevel } from '../src/utils/Logger.js';

const buildBaseConfig = () => ({
    payeeTransformation: {
        enabled: false,
    },
    import: {
        importUncheckedTransactions: true,
    },
    actualServers: [
        {
            serverUrl: 'http://localhost:5006',
            serverPassword: 'test-password',
            budgets: [
                {
                    syncId: 'test-sync-id',
                    e2eEncryption: {
                        enabled: false,
                        password: '',
                    },
                    accountMapping: {
                        'test-account': 'actual-account-id',
                    },
                },
            ],
        },
    ],
});

const tmpPrefix = path.join(os.tmpdir(), 'actual-monmon-config-tests-');
const createdTempDirs: string[] = [];

afterEach(async () => {
    while (createdTempDirs.length > 0) {
        const dir = createdTempDirs.pop();
        if (!dir) {
            continue;
        }

        await rm(dir, { recursive: true, force: true });
    }
});

describe('Config Validation', () => {
    describe('maskPayeeNamesInLogs defaults', () => {
        it('applies independent defaults for importer and payee transformation masking', () => {
            const parsedConfig = configSchema.parse(buildBaseConfig());

            expect(parsedConfig.import.maskPayeeNamesInLogs).toBe(false);
            expect(parsedConfig.payeeTransformation.maskPayeeNamesInLogs).toBe(
                true
            );
        });

        it('allows overriding payee transformation masking without affecting importer defaults', () => {
            const parsedConfig = configSchema.parse({
                ...buildBaseConfig(),
                payeeTransformation: {
                    enabled: false,
                    maskPayeeNamesInLogs: false,
                },
            });

            expect(parsedConfig.import.maskPayeeNamesInLogs).toBe(false);
            expect(parsedConfig.payeeTransformation.maskPayeeNamesInLogs).toBe(
                false
            );
        });

        it('allows overriding importer masking without affecting payee transformation defaults', () => {
            const parsedConfig = configSchema.parse({
                ...buildBaseConfig(),
                import: {
                    importUncheckedTransactions: true,
                    maskPayeeNamesInLogs: true,
                },
            });

            expect(parsedConfig.import.maskPayeeNamesInLogs).toBe(true);
            expect(parsedConfig.payeeTransformation.maskPayeeNamesInLogs).toBe(
                true
            );
        });
    });

    describe('E2E Encryption Validation', () => {
        it('should allow empty password when encryption is disabled', () => {
            const validConfig = {
                payeeTransformation: {
                    enabled: false,
                },
                import: {
                    importUncheckedTransactions: true,
                },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        serverPassword: 'test-password',
                        budgets: [
                            {
                                syncId: 'test-sync-id',
                                e2eEncryption: {
                                    enabled: false,
                                    password: '',
                                },
                                accountMapping: {
                                    'test-account': 'actual-account-id',
                                },
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(validConfig)).not.toThrow();
        });

        it('should allow undefined password when encryption is disabled', () => {
            const validConfig = {
                payeeTransformation: {
                    enabled: false,
                },
                import: {
                    importUncheckedTransactions: true,
                },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        serverPassword: 'test-password',
                        budgets: [
                            {
                                syncId: 'test-sync-id',
                                e2eEncryption: {
                                    enabled: false,
                                    // password is undefined
                                },
                                accountMapping: {
                                    'test-account': 'actual-account-id',
                                },
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(validConfig)).not.toThrow();
        });

        it('should require non-empty password when encryption is enabled', () => {
            const invalidConfig = {
                payeeTransformation: {
                    enabled: false,
                },
                import: {
                    importUncheckedTransactions: true,
                },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        serverPassword: 'test-password',
                        budgets: [
                            {
                                syncId: 'test-sync-id',
                                e2eEncryption: {
                                    enabled: true,
                                    password: '',
                                },
                                accountMapping: {
                                    'test-account': 'actual-account-id',
                                },
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(invalidConfig)).toThrow();
        });

        it('should reject whitespace-only password when encryption is enabled', () => {
            const invalidConfig = {
                payeeTransformation: { enabled: false },
                import: { importUncheckedTransactions: true },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        serverPassword: 'test-password',
                        budgets: [
                            {
                                syncId: 'test-sync-id',
                                e2eEncryption: {
                                    enabled: true,
                                    password: '   ',
                                },
                                accountMapping: {
                                    'test-account': 'actual-account-id',
                                },
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(invalidConfig)).toThrow();
        });

        it('should require password when encryption is enabled (undefined password)', () => {
            const invalidConfig = {
                payeeTransformation: {
                    enabled: false,
                },
                import: {
                    importUncheckedTransactions: true,
                },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        serverPassword: 'test-password',
                        budgets: [
                            {
                                syncId: 'test-sync-id',
                                e2eEncryption: {
                                    enabled: true,
                                    // password is undefined
                                },
                                accountMapping: {
                                    'test-account': 'actual-account-id',
                                },
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(invalidConfig)).toThrow();
        });

        it('should accept valid password when encryption is enabled', () => {
            const validConfig = {
                payeeTransformation: {
                    enabled: false,
                },
                import: {
                    importUncheckedTransactions: true,
                },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        serverPassword: 'test-password',
                        budgets: [
                            {
                                syncId: 'test-sync-id',
                                e2eEncryption: {
                                    enabled: true,
                                    password: 'valid-encryption-password',
                                },
                                accountMapping: {
                                    'test-account': 'actual-account-id',
                                },
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(validConfig)).not.toThrow();
        });

        it('should handle multiple budgets with different encryption settings', () => {
            const validConfig = {
                payeeTransformation: {
                    enabled: false,
                },
                import: {
                    importUncheckedTransactions: true,
                },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        serverPassword: 'test-password',
                        budgets: [
                            {
                                syncId: 'test-sync-id-1',
                                e2eEncryption: {
                                    enabled: false,
                                    password: '',
                                },
                                accountMapping: {
                                    'test-account-1': 'actual-account-id-1',
                                },
                            },
                            {
                                syncId: 'test-sync-id-2',
                                e2eEncryption: {
                                    enabled: true,
                                    password: 'valid-encryption-password',
                                },
                                accountMapping: {
                                    'test-account-2': 'actual-account-id-2',
                                },
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(validConfig)).not.toThrow();
        });
    });

    describe('Basic Config Validation', () => {
        it('should validate a minimal valid configuration', () => {
            const validConfig = {
                payeeTransformation: {
                    enabled: false,
                },
                import: {
                    importUncheckedTransactions: true,
                },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        serverPassword: 'test-password',
                        budgets: [
                            {
                                syncId: 'test-sync-id',
                                e2eEncryption: {
                                    enabled: false,
                                    password: '',
                                },
                                accountMapping: {},
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(validConfig)).not.toThrow();
        });

        it('should reject configuration with missing required fields', () => {
            const invalidConfig = {
                payeeTransformation: {
                    enabled: false,
                },
                import: {
                    importUncheckedTransactions: true,
                },
                actualServers: [
                    {
                        serverUrl: 'http://localhost:5006',
                        // missing serverPassword
                        budgets: [
                            {
                                syncId: 'test-sync-id',
                                e2eEncryption: {
                                    enabled: false,
                                    password: '',
                                },
                                accountMapping: {},
                            },
                        ],
                    },
                ],
            };

            expect(() => configSchema.parse(invalidConfig)).toThrow();
        });
    });
});

describe('Configuration default logging', () => {
    it('collects defaulted configuration decisions for missing optional values', () => {
        const rawConfig = buildBaseConfig();
        const parsedConfig = configSchema.parse(rawConfig);

        expect(
            collectDefaultedConfigDecisions(rawConfig, parsedConfig)
        ).toEqual([
            {
                path: 'import.synchronizeClearedStatus',
                value: true,
            },
            {
                path: 'import.maskPayeeNamesInLogs',
                value: false,
            },
            {
                path: 'payeeTransformation.openAiModel',
                value: 'gpt-3.5-turbo',
            },
            {
                path: 'payeeTransformation.skipModelValidation',
                value: false,
            },
            {
                path: 'payeeTransformation.maskPayeeNamesInLogs',
                value: true,
            },
            {
                path: 'actualServers[0].requestTimeoutMs',
                value: FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS,
                hints: ['Server URL: http://localhost:5006'],
            },
        ]);
    });

    it('emits debug logs for defaults only when debug logging is enabled', async () => {
        const tempDir = await mkdtemp(tmpPrefix);
        createdTempDirs.push(tempDir);

        const configPath = path.join(tempDir, 'config.toml');
        const configContent = `
[payeeTransformation]
enabled = false

[import]
importUncheckedTransactions = true

[[actualServers]]
serverUrl = "http://localhost:5006"
serverPassword = "test-password"

[[actualServers.budgets]]
syncId = "test-budget"

[actualServers.budgets.e2eEncryption]
enabled = false
password = ""

[actualServers.budgets.accountMapping]
"test-account" = "actual-account-id"
`;

        await writeFile(configPath, configContent, 'utf8');

        const argv = { config: configPath } as unknown as ArgumentsCamelCase;
        const logger = new Logger(LogLevel.INFO);

        const consoleSpy = vi
            .spyOn(console, 'log')
            .mockImplementation(() => undefined);

        try {
            const { defaultDecisions } = await loadConfig(argv);
            expect(defaultDecisions.length).toBeGreaterThan(0);

            logDefaultedConfigDecisions(logger, defaultDecisions);
            expect(consoleSpy).not.toHaveBeenCalled();

            consoleSpy.mockClear();
            logger.setLogLevel(LogLevel.DEBUG);

            logDefaultedConfigDecisions(logger, defaultDecisions);

            expect(consoleSpy).toHaveBeenCalled();
        } finally {
            consoleSpy.mockRestore();
        }
    });

    it('aggregates multiple default decisions into a single debug entry', () => {
        const logger = new Logger(LogLevel.DEBUG);
        const debugSpy = vi
            .spyOn(logger, 'debug')
            .mockImplementation(() => undefined);

        try {
            logDefaultedConfigDecisions(logger, [
                { path: 'first.path', value: true },
                {
                    path: 'second.path',
                    value: 'value',
                    hints: ['extra context'],
                },
            ]);

            expect(debugSpy).toHaveBeenCalledTimes(1);
            expect(debugSpy).toHaveBeenCalledWith(
                'Using default configuration values for 2 entries.',
                [
                    'Path: first.path',
                    'Value: true',
                    'Path: second.path',
                    'Value: value',
                    '  extra context',
                ]
            );
        } finally {
            debugSpy.mockRestore();
        }
    });
});
