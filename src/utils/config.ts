import fs from 'fs/promises';
import path from 'path';
import toml from 'toml';
import type { ArgumentsCamelCase } from 'yargs';
import { formatISO, isValid as isValidDate, parseISO } from 'date-fns';
import { ZodError, ZodIssueCode, z } from 'zod';
import Logger from './Logger.js';
import { DEFAULT_CONFIG_FILE } from './shared.js';

const trimmedNonEmptyString = (message: string) =>
    z.string().trim().min(1, message);

const isoDateSchema = z
    .string()
    .trim()
    .superRefine((value, ctx) => {
        const parsed = parseISO(value);

        if (!isValidDate(parsed)) {
            ctx.addIssue({
                code: ZodIssueCode.custom,
                message:
                    'Invalid earliest import date. Provide a valid ISO 8601 date (YYYY-MM-DD).',
            });
            return;
        }

        const canonical = formatISO(parsed, { representation: 'date' });
        if (canonical !== value) {
            ctx.addIssue({
                code: ZodIssueCode.custom,
                message:
                    'Invalid earliest import date. Provide a valid ISO 8601 date (YYYY-MM-DD).',
            });
        }
    });

export const DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS = 300000;
export const FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS = 45000;

const budgetSchema = z
    .object({
        syncId: trimmedNonEmptyString('Sync ID must not be empty'),
        earliestImportDate: isoDateSchema.optional(),
        e2eEncryption: z.object({
            enabled: z.boolean(),
            password: z.string().trim().optional(),
        }),
        accountMapping: z.record(z.string(), z.string()),
    })
    .superRefine((val, ctx) => {
        if (val.e2eEncryption.enabled && !val.e2eEncryption.password) {
            ctx.addIssue({
                code: ZodIssueCode.custom,
                message:
                    'Password must not be empty if end-to-end encryption is enabled',
                path: ['e2eEncryption', 'password'],
            });
        }
    });

const actualServerSchema = z.object({
    serverUrl: z.string().trim().url(),
    serverPassword: trimmedNonEmptyString('Server password must not be empty'),
    requestTimeoutMs: z
        .number()
        .int()
        .positive()
        .max(
            DEFAULT_ACTUAL_REQUEST_TIMEOUT_MS,
            'Actual server timeout must be 5 minutes (300000 ms) or less'
        )
        .default(FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS),
    budgets: z.array(budgetSchema).min(1),
});

const payeeTransformationSchema = z.object({
    enabled: z.boolean(),
    openAiApiKey: trimmedNonEmptyString(
        'OpenAI API key must not be empty'
    ).optional(),
    openAiModel: z.string().trim().optional().default('gpt-3.5-turbo'),
    skipModelValidation: z.boolean().default(false),
    maskPayeeNamesInLogs: z.boolean().default(true),
    customPrompt: z.string().optional(),
    modelConfig: z
        .object({
            temperature: z.number().min(0).max(2).optional(),
            maxTokens: z.number().positive().int().optional(),
            timeout: z.number().positive().int().optional(),
        })
        .optional(),
});

export const configSchema = z
    .object({
        payeeTransformation: payeeTransformationSchema,
        import: z.object({
            importUncheckedTransactions: z.boolean(),
            synchronizeClearedStatus: z.boolean().default(true),
            maskPayeeNamesInLogs: z.boolean().default(false),
            ignorePatterns: z
                .object({
                    commentPatterns: z.array(z.string()).optional(),
                    payeePatterns: z.array(z.string()).optional(),
                    purposePatterns: z.array(z.string()).optional(),
                })
                .optional(),
        }),
        actualServers: z.array(actualServerSchema).min(1),
    })
    .superRefine((val, ctx) => {
        // Check openAI key if payeeTransformation is enabled
        if (
            val.payeeTransformation.enabled &&
            !val.payeeTransformation.openAiApiKey
        ) {
            ctx.addIssue({
                code: ZodIssueCode.custom,
                message:
                    'OpenAI key must not be empty if payeeTransformation is enabled',
                path: ['payeeTransformation', 'openAiApiKey'],
            });
        }
    });

export type PayeeTransformationConfig = z.infer<
    typeof payeeTransformationSchema
>;
export type ActualServerConfig = z.infer<typeof actualServerSchema>;
export type ActualBudgetConfig = z.infer<typeof budgetSchema>;
export type Config = z.infer<typeof configSchema>;

export interface ConfigDefaultDecision {
    path: string;
    value: unknown;
    hints?: string[];
}

export interface LoadedConfig {
    config: Config;
    defaultDecisions: ConfigDefaultDecision[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string) =>
    Object.prototype.hasOwnProperty.call(value, key);

const formatDefaultValue = (value: unknown): string => {
    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    try {
        return JSON.stringify(value);
    } catch (_error) {
        return String(value);
    }
};

export const collectDefaultedConfigDecisions = (
    rawConfig: unknown,
    parsedConfig: Config
): ConfigDefaultDecision[] => {
    if (!isRecord(rawConfig)) {
        return [];
    }

    const decisions: ConfigDefaultDecision[] = [];

    const importConfig = isRecord(rawConfig.import) ? rawConfig.import : {};
    if (!hasOwn(importConfig, 'synchronizeClearedStatus')) {
        decisions.push({
            path: 'import.synchronizeClearedStatus',
            value: parsedConfig.import.synchronizeClearedStatus,
        });
    }
    if (!hasOwn(importConfig, 'maskPayeeNamesInLogs')) {
        decisions.push({
            path: 'import.maskPayeeNamesInLogs',
            value: parsedConfig.import.maskPayeeNamesInLogs,
        });
    }

    const payeeTransformationConfig = isRecord(rawConfig.payeeTransformation)
        ? rawConfig.payeeTransformation
        : {};
    if (!hasOwn(payeeTransformationConfig, 'openAiModel')) {
        decisions.push({
            path: 'payeeTransformation.openAiModel',
            value: parsedConfig.payeeTransformation.openAiModel,
        });
    }
    if (!hasOwn(payeeTransformationConfig, 'skipModelValidation')) {
        decisions.push({
            path: 'payeeTransformation.skipModelValidation',
            value: parsedConfig.payeeTransformation.skipModelValidation,
        });
    }
    if (!hasOwn(payeeTransformationConfig, 'maskPayeeNamesInLogs')) {
        decisions.push({
            path: 'payeeTransformation.maskPayeeNamesInLogs',
            value: parsedConfig.payeeTransformation.maskPayeeNamesInLogs,
        });
    }

    const actualServersRaw = Array.isArray(rawConfig.actualServers)
        ? rawConfig.actualServers
        : [];
    for (const [index, server] of actualServersRaw.entries()) {
        if (!isRecord(server) || hasOwn(server, 'requestTimeoutMs')) {
            continue;
        }

        const parsedServer = parsedConfig.actualServers[index];
        const hints = parsedServer?.serverUrl
            ? [`Server URL: ${parsedServer.serverUrl}`]
            : undefined;
        decisions.push({
            path: `actualServers[${index}].requestTimeoutMs`,
            value:
                parsedServer?.requestTimeoutMs ??
                FALLBACK_ACTUAL_REQUEST_TIMEOUT_MS,
            hints,
        });
    }

    return decisions;
};

export const logDefaultedConfigDecisions = (
    logger: Logger,
    decisions: ConfigDefaultDecision[]
) => {
    if (decisions.length === 0) {
        return;
    }

    if (decisions.length === 1) {
        const decision = decisions[0];
        if (!decision) {
            return;
        }
        const hints = [
            `Path: ${decision.path}`,
            `Value: ${formatDefaultValue(decision.value)}`,
            ...(decision.hints ?? []),
        ];
        logger.debug('Using default configuration value.', hints);
        return;
    }

    const aggregatedHints: string[] = [];
    for (const decision of decisions) {
        const pathValue =
            typeof decision.path === 'string'
                ? decision.path
                : String(decision.path ?? '<unknown>');
        aggregatedHints.push(`Path: ${pathValue}`);
        aggregatedHints.push(`Value: ${formatDefaultValue(decision.value)}`);
        for (const hint of decision.hints ?? []) {
            aggregatedHints.push(`  ${hint}`);
        }
    }

    logger.debug(
        `Using default configuration values for ${decisions.length} entries.`,
        aggregatedHints
    );
};

export const getConfigFile = (argv: ArgumentsCamelCase): string => {
    if (argv.config) {
        const argvConfigFile = path.resolve(argv.config as string);
        return argvConfigFile;
    }

    return DEFAULT_CONFIG_FILE;
};

export const loadConfig = async (
    argv: ArgumentsCamelCase
): Promise<LoadedConfig> => {
    const configFile = getConfigFile(argv);

    let configContent: string;
    try {
        configContent = await fs.readFile(configFile, 'utf-8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(
                `Config file not found: '${configFile}'. Create it or use the --config option to specify a different path.`
            );
        }
        throw error;
    }

    try {
        const configData = toml.parse(configContent);
        const config = configSchema.parse(configData);
        const defaultDecisions = collectDefaultedConfigDecisions(
            configData,
            config
        );

        return {
            config,
            defaultDecisions,
        };
    } catch (e) {
        const parseError = e as Error & { line?: number; column?: number };
        if (parseError instanceof Error && parseError.name === 'SyntaxError') {
            const line = parseError.line ?? -1;
            const column = parseError.column ?? -1;

            throw new Error(
                `Failed to parse configuration file: ${parseError.message} (line ${line}, column ${column})`
            );
        }

        if (e instanceof ZodError) {
            const formattedIssues = e.issues
                .map((issue) => {
                    const path = issue.path.join('.') || '<root>';
                    return `${path}: ${issue.message}`;
                })
                .join('; ');

            throw new Error(`Invalid configuration: ${formattedIssues}`);
        }

        throw new Error(
            `Invalid configuration file format. Run 'validate' to see errors.`
        );
    }
};

export const getConfig = async (argv: ArgumentsCamelCase): Promise<Config> => {
    const { config } = await loadConfig(argv);
    return config;
};
