import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import Logger, { LogLevel } from './Logger.js';
import { PayeeTransformationConfig } from './config.js';
import { DEFAULT_DATA_DIR } from './shared.js';

interface ModelCapabilities {
    supportsTemperature: boolean;
    supportsMaxTokens: boolean;
    defaultTemperature: number;
}

interface ModelCache {
    models: Array<string>;
    expiresAt: number;
}

const MODEL_CACHE_FILENAME = 'openai-model-cache.json';
const MODEL_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

type ExtendedChatCompletionCreateParams =
    OpenAI.Chat.Completions.ChatCompletionCreateParams & {
        temperature?: number;
    };

class PayeeTransformer {
    private openai: OpenAI;
    private availableModels: Array<string> | null = null;
    private modelListInitialized = false;
    private modelCapabilities: Map<string, ModelCapabilities> = new Map();
    private transformationCache = new Map<string, string>();

    private static modelCache: ModelCache | null = null;

    private static getCacheFilePath() {
        return path.join(DEFAULT_DATA_DIR, MODEL_CACHE_FILENAME);
    }

    private static async ensureCacheDirExists() {
        await fs.mkdir(DEFAULT_DATA_DIR, { recursive: true });
    }

    private static async readModelCacheFromDisk() {
        try {
            const cacheFile = PayeeTransformer.getCacheFilePath();
            const cacheContent = await fs.readFile(cacheFile, 'utf-8');
            const parsed = JSON.parse(cacheContent) as ModelCache;
            if (
                !Array.isArray(parsed.models) ||
                typeof parsed.expiresAt !== 'number'
            ) {
                return null;
            }

            return parsed;
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                return null;
            }

            return null;
        }
    }

    private static async writeModelCacheToDisk(cache: ModelCache) {
        try {
            await PayeeTransformer.ensureCacheDirExists();
            const cacheFile = PayeeTransformer.getCacheFilePath();
            const tmpFile = `${cacheFile}.tmp`;
            await fs.writeFile(
                tmpFile,
                JSON.stringify(cache, null, 2),
                'utf-8'
            );
            await fs.rename(tmpFile, cacheFile);
        } catch (_error) {
            // Ignore cache write errors but log in debug environments if needed
        }
    }

    constructor(
        private config: PayeeTransformationConfig,
        private logger: Logger
    ) {
        if (!config.openAiApiKey) {
            throw new Error(
                'An OpenAI API key is required for payee transformation. Please set the key in the configuration file.'
            );
        }

        this.openai = new OpenAI({
            apiKey: config.openAiApiKey,
            timeout: config.modelConfig?.timeout || 30000, // 30 seconds default
        });
    }

    public async transformPayees(
        payeeList: string[]
    ): Promise<Record<string, string> | null> {
        const prompt = this.generatePrompt();

        if (payeeList.length === 0) {
            this.logger.debug(
                'No payees to transform. Returning empty object.'
            );
            return {};
        }

        const uniquePayees = Array.from(new Set(payeeList));
        const uncachedPayees = uniquePayees.filter(
            (payee) => !this.transformationCache.has(payee)
        );

        this.logger.debug(
            'Original payee names:',
            this.formatPayeeListForLog(uniquePayees)
        );

        if (uncachedPayees.length === 0) {
            this.logger.debug(
                'All payees resolved from cache. Skipping OpenAI request.'
            );
            return this.buildResponse(uniquePayees);
        }

        this.logger.debug(`Starting payee transformation...`, [
            `Payees requested: ${uniquePayees.length}`,
            `Using cache for: ${uniquePayees.length - uncachedPayees.length}`,
            `Model: ${this.config.openAiModel}`,
        ]);

        try {
            const model = await this.getConfiguredModel();

            const response = await this.makeOpenAIRequest(
                prompt,
                uncachedPayees,
                model
            );

            if (!response || !response.choices[0]?.message?.content) {
                this.logger.error('Invalid response from OpenAI API');
                return null;
            }

            const output = response.choices[0].message.content;

            try {
                const parsed = JSON.parse(output) as unknown;
                if (
                    typeof parsed !== 'object' ||
                    parsed === null ||
                    Array.isArray(parsed)
                ) {
                    throw new Error(
                        'Transformed payee response is not an object'
                    );
                }

                const transformedPayees = parsed as {
                    [key: string]: string;
                };

                for (const [original, transformed] of Object.entries(
                    transformedPayees
                )) {
                    if (typeof transformed === 'string') {
                        this.transformationCache.set(original, transformed);
                    }
                }

                const finalResult = this.buildResponse(uniquePayees);

                const mappingForLog =
                    this.formatPayeeMappingForLog(finalResult);
                this.logger.debug('Payee transformation completed:', [
                    'Original → Transformed:',
                    ...mappingForLog,
                ]);

                return finalResult;
            } catch (parseError) {
                this.logger.error(
                    `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
                );
                if (this.shouldMaskPayeeLogs()) {
                    this.logger.debug(
                        'Raw response omitted to respect payee masking configuration.'
                    );
                } else {
                    this.logger.debug(`Raw response: ${output}`);
                }
                return null;
            }
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    private async makeOpenAIRequest(
        prompt: string,
        payeeList: string[],
        model: string,
        retries = 3
    ) {
        const capabilities = await this.getModelCapabilities(model);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const requestConfig: ExtendedChatCompletionCreateParams = {
                    model,
                    messages: [
                        { role: 'system', content: prompt },
                        { role: 'user', content: payeeList.join('\n') },
                    ],
                    response_format: {
                        type: 'json_object',
                    },
                };

                // Add model-specific parameters based on capabilities
                if (
                    capabilities.supportsTemperature &&
                    this.config.modelConfig?.temperature !== undefined
                ) {
                    requestConfig.temperature =
                        this.config.modelConfig.temperature;
                }

                if (
                    capabilities.supportsMaxTokens &&
                    this.config.modelConfig?.maxTokens !== undefined
                ) {
                    requestConfig.max_tokens =
                        this.config.modelConfig.maxTokens;
                }

                this.logger.debug(
                    `Making OpenAI request (attempt ${attempt})`,
                    [
                        `Model: ${model}`,
                        `Temperature: ${requestConfig.temperature || 'default'}`,
                        `Max tokens: ${requestConfig.max_tokens || 'default'}`,
                    ]
                );

                const response =
                    await this.openai.chat.completions.create(requestConfig);
                return response;
            } catch (error) {
                if (attempt === retries) throw error;

                // Only retry on specific errors
                if (error instanceof Error && 'status' in error) {
                    const status = (error as { status?: number }).status;
                    if (status && (status === 429 || status >= 500)) {
                        this.logger.debug(
                            `Attempt ${attempt} failed, retrying... (${status})`
                        );
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000 * attempt)
                        ); // Exponential backoff
                        continue;
                    }
                }
                throw error;
            }
        }
    }

    private async getModelCapabilities(
        model: string
    ): Promise<ModelCapabilities> {
        if (this.modelCapabilities.has(model)) {
            return this.modelCapabilities.get(model)!;
        }

        // Determine model capabilities based on model name patterns
        const capabilities: ModelCapabilities = {
            supportsTemperature: true,
            supportsMaxTokens: true,
            defaultTemperature: 0.7,
        };

        // GPT-4o/GPT-5 models expose full temperature control (0.0-2.0) and
        // default closer to 0.7 for more creative responses. Older GPT-4 and
        // GPT-3.5 series models default to the same midpoint but allow the
        // full range to be configured explicitly when needed.
        if (
            model.includes('gpt-4o') ||
            model.includes('gpt-5') ||
            model.includes('gpt-4') ||
            model.includes('gpt-3.5')
        ) {
            capabilities.defaultTemperature = 0.7;
        }

        this.modelCapabilities.set(model, capabilities);
        return capabilities;
    }

    private async getConfiguredModel() {
        if (this.config.skipModelValidation) {
            this.logger.debug('Skipping OpenAI model validation.');
            return this.config.openAiModel;
        }

        const availableModels = await this.getAvailableModels();

        if (!availableModels.includes(this.config.openAiModel)) {
            this.logger.error(
                `The specified model '${this.config.openAiModel}' is invalid. The following models are available:`,
                availableModels
            );
            throw new Error('Invalid OpenAI model specified.');
        }

        return this.config.openAiModel;
    }

    private async getAvailableModels() {
        if (this.modelListInitialized && this.availableModels) {
            return this.availableModels;
        }

        const now = Date.now();

        const inMemoryCache = PayeeTransformer.modelCache;
        if (inMemoryCache && inMemoryCache.expiresAt > now) {
            this.logger.debug('Using in-memory OpenAI model cache.');
            this.availableModels = inMemoryCache.models;
            this.modelListInitialized = true;
            return this.availableModels;
        }

        const diskCache = await PayeeTransformer.readModelCacheFromDisk();
        if (diskCache && diskCache.expiresAt > now) {
            this.logger.debug('Loaded OpenAI model list from disk cache.');
            PayeeTransformer.modelCache = diskCache;
            this.availableModels = diskCache.models;
            this.modelListInitialized = true;
            return this.availableModels;
        }

        this.logger.debug('Fetching OpenAI model list from OpenAI API...');
        let models: string[] = [];
        try {
            const response = await this.openai.models.list();
            models = response.data.map((m) => m.id);
        } catch (err) {
            this.logger.error('Failed to fetch OpenAI model list');
            throw err;
        }
        const cache: ModelCache = {
            models,
            expiresAt: now + MODEL_CACHE_TTL_MS,
        };

        PayeeTransformer.modelCache = cache;
        this.availableModels = models;
        this.modelListInitialized = true;

        await PayeeTransformer.writeModelCacheToDisk(cache);

        this.logger.debug(`Found ${models.length} available models.`);

        return models;
    }

    private generatePrompt() {
        // Use custom prompt if provided, otherwise use default
        if (this.config.customPrompt) {
            this.logger.debug('Using custom prompt from configuration');
            return this.config.customPrompt;
        }

        this.logger.debug('Using default prompt');
        return `You are a financial transaction classifier. Your task is to standardize payee names from bank transactions.

TASK: Convert raw payee names into clean, human-readable names.

RULES:
- Return ONLY valid JSON objects
- Map original payee names to standardized names
- Make names concise and recognizable
- Use consistent naming conventions
- Only transform names that would benefit from standardization
- Keep original names unchanged if they are already clear and meaningful
- For corporate/company names, remove unnecessary suffixes (GmbH, AG, Inc., etc.) when it makes the name cleaner
- For personal names, keep them as-is unless they contain obvious typos or formatting issues
- Return empty object {} if no input

EXAMPLES:
Input: "Amzn Mktp US*1234567890"
Output: {"Amzn Mktp US*1234567890": "Amazon"}

Input: "AMAZON.COM/BILLWA\nAMAZON.COM"
Output: {"AMAZON.COM/BILLWA": "Amazon", "AMAZON.COM": "Amazon"}

Input: "Max Müller"
Output: {"Max Müller": "Max Müller"}

Input: "HanseMerkur Speziale Krankenversicherung AG"
Output: {"HanseMerkur Speziale Krankenversicherung AG": "HanseMerkur"}

Input: ""
Output: {}

CRITICAL: Return ONLY valid JSON. No explanations or additional text.`;
    }

    private handleError(error: unknown) {
        if (error instanceof Error) {
            // Handle specific OpenAI errors
            if (
                'status' in error &&
                typeof (error as { status?: number }).status === 'number'
            ) {
                const status = (error as { status?: number }).status;
                switch (status) {
                    case 401:
                        this.logger.error(
                            'OpenAI API key is invalid or expired'
                        );
                        break;
                    case 403:
                        this.logger.error(
                            'OpenAI API access forbidden - check your API key permissions'
                        );
                        break;
                    case 429:
                        this.logger.error(
                            'OpenAI API rate limit exceeded - try again later'
                        );
                        break;
                    case 500:
                        this.logger.error(
                            'OpenAI API server error - try again later'
                        );
                        break;
                    case 502:
                    case 503:
                    case 504:
                        this.logger.error(
                            'OpenAI API service temporarily unavailable - try again later'
                        );
                        break;
                    default:
                        this.logger.error(
                            `OpenAI API error (${status}): ${error.message}`
                        );
                }
            } else {
                this.logger.error(
                    `Error in payee transformation: ${error.message}`
                );
            }
        } else {
            this.logger.error('Unknown error in payee transformation');
        }
    }

    private shouldMaskPayeeLogs() {
        return (
            this.config.maskPayeeNamesInLogs &&
            this.logger.getLevel() < LogLevel.DEBUG
        );
    }

    private formatPayeeListForLog(payees: Array<string>) {
        if (!this.shouldMaskPayeeLogs()) {
            return payees;
        }

        return payees.map((payee) => this.obfuscatePayeeName(payee));
    }

    private formatPayeeMappingForLog(
        mappings: Record<string, string>
    ): Array<string> {
        const shouldMask = this.shouldMaskPayeeLogs();

        return Object.entries(mappings).map(([original, transformed]) => {
            const displayOriginal = shouldMask
                ? this.obfuscatePayeeName(original)
                : original;
            const displayTransformed = shouldMask
                ? this.obfuscatePayeeName(transformed)
                : transformed;

            return `  "${displayOriginal}" → "${displayTransformed}"`;
        });
    }

    private obfuscatePayeeName(payee: string) {
        if (payee.length <= 2) {
            return '•'.repeat(Math.max(payee.length, 1));
        }

        const firstChar = payee[0];
        const lastChar = payee[payee.length - 1];
        const middle = '•'.repeat(payee.length - 2);

        return `${firstChar}${middle}${lastChar}`;
    }

    private buildResponse(payees: Array<string>) {
        return payees.reduce(
            (acc, payee) => {
                acc[payee] = this.transformationCache.get(payee) ?? payee;
                return acc;
            },
            {} as Record<string, string>
        );
    }
}

export default PayeeTransformer;
