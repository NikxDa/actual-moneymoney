import path from 'path';
import toml from 'toml';
import fs from 'fs/promises';
import { ArgumentsCamelCase } from 'yargs';
import { DEFAULT_CONFIG_FILE } from './shared.js';
import { ZodIssueCode, z } from 'zod';

const budgetSchema = z
    .object({
        syncId: z.string(),
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

        return val;
    });

const actualServerSchema = z.object({
    serverUrl: z.string(),
    serverPassword: z.string(),
    budgets: z.array(budgetSchema).min(1),
});

export const configSchema = z
    .object({
        payeeTransformation: z.object({
            enabled: z.boolean(),
            openAiApiKey: z.string().optional(),
        }),
        import: z.object({
            importUncheckedTransactions: z.boolean(),
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
    const configData = toml.parse(configContent);

    try {
        return configSchema.parse(configData);
    } catch (e) {
        throw new Error(
            `Invalid configuration file format. Run 'validate' to see errors.`
        );
    }
};
