import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/utils/config.js';

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

describe('Config Validation', () => {
    describe('maskPayeeNamesInLogs defaults', () => {
        it('applies independent defaults for importer and payee transformation masking', () => {
            const parsedConfig = configSchema.parse(buildBaseConfig());

            expect(parsedConfig.import.maskPayeeNamesInLogs).toBe(false);
            expect(
                parsedConfig.payeeTransformation.maskPayeeNamesInLogs
            ).toBe(true);
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
            expect(
                parsedConfig.payeeTransformation.maskPayeeNamesInLogs
            ).toBe(false);
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
            expect(
                parsedConfig.payeeTransformation.maskPayeeNamesInLogs
            ).toBe(true);
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
                                accountMapping: { 'test-account': 'actual-account-id' },
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
