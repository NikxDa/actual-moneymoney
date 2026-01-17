import fs from 'fs/promises';
import path from 'path';
import toml from 'toml';
import { ArgumentsCamelCase } from 'yargs';
import { ZodIssueCode, z } from 'zod';
import { DEFAULT_CONFIG_FILE } from './shared.js';

const budgetSchema = z
    .object({
        syncId: z.string(),
        earliestImportDate: z.string().optional(),
        e2eEncryption: z.object({
            enabled: z.boolean(),
            password: z.string().optional(),
        }),
        accountMapping: z.record(z.string()),
    })
    .superRefine((val, ctx) => {
        if (val.e2eEncryption.enabled && !val.e2eEncryption.password) {
            ctx.addIssue({
                code: ZodIssueCode.custom,
                message:
                    'Password must not be empty if end-to-end encryption is enabled',
            });
        }

        if (val.earliestImportDate) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(val.earliestImportDate)) {
                ctx.addIssue({
                    code: ZodIssueCode.custom,
                    message:
                        'Invalid earliest import date format (required format is YYYY-MM-DD)',
                });
            }
        }

        return val;
    });

const actualServerSchema = z.object({
    serverUrl: z.string(),
    serverPassword: z.string(),
    budgets: z.array(budgetSchema).min(1),
});

const payeeTransformationSchema = z.object({
    enabled: z.boolean(),
    openAiApiKey: z.string().optional(),
    openAiModel: z.string().optional().default('gpt-3.5-turbo'),
    prompt: z.string().optional(),
});

export const configSchema = z
    .object({
        payeeTransformation: payeeTransformationSchema,
        import: z.object({
            importUncheckedTransactions: z.boolean(),
            synchronizeClearedStatus: z.boolean().default(true),
            importComments: z.boolean().default(false),
            commentPrefix: z.string().default('MoneyMoney Comment: '),
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
            });
        }
    });

export type PayeeTransformationConfig = z.infer<
    typeof payeeTransformationSchema
>;
export type ActualServerConfig = z.infer<typeof actualServerSchema>;
export type ActualBudgetConfig = z.infer<typeof budgetSchema>;
export type Config = z.infer<typeof configSchema>;

export const getConfigFile = (argv: ArgumentsCamelCase) => {
    if (argv.config) {
        const argvConfigFile = path.resolve(argv.config as string);
        return argvConfigFile;
    }

    return DEFAULT_CONFIG_FILE;
};

export const getConfig = async (argv: ArgumentsCamelCase) => {
    const configFile = getConfigFile(argv);

    const configFileExists = await fs
        .access(configFile)
        .then(() => true)
        .catch(() => false);

    if (!configFileExists) {
        throw new Error(
            `Config file not found: '${configFile}'. Create it or use the --config option to specify a different path.`
        );
    }

    const configContent = await fs.readFile(configFile, 'utf-8');

    try {
        const configData = toml.parse(configContent);
        return configSchema.parse(configData);
    } catch (e) {
        if (e instanceof Error && e.name === 'SyntaxError') {
            const line = 'line' in e ? e.line : -1;
            const column = 'column' in e ? e.column : -1;

            throw new Error(
                `Failed to parse configuration file: ${e.message} (line ${line}, column ${column})`
            );
        }

        throw new Error(
            `Invalid configuration file format. Run 'validate' to see errors.`
        );
    }
};
