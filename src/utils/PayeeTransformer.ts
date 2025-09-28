import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import Logger from './Logger.js';
import type { PayeeTransformationConfig } from './config.js';
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
const MAX_LOG_ENTRIES = 50;

type ExtendedChatCompletionCreateParams =
    OpenAI.Chat.Completions.ChatCompletionCreateParams;

class PayeeTransformer {
    private openai: OpenAI;
    private availableModels: Array<string> | null = null;
    private modelListInitialized = false;
    private modelCapabilities: Map<string, ModelCapabilities> = new Map();
    private transformationCache = new Map<string, string>();

    private static modelCache: ModelCache | null = null;

    private static getCacheFilePath(): string {
        return path.join(DEFAULT_DATA_DIR, MODEL_CACHE_FILENAME);
    }

    private static async ensureCacheDirExists(): Promise<void> {
        await fs.mkdir(DEFAULT_DATA_DIR, { recursive: true });
    }

    private static async deleteModelCacheFile(): Promise<void> {
        try {
            const cacheFile = PayeeTransformer.getCacheFilePath();
            await fs.rm(cacheFile, { force: true });
        } catch (_error) {
            // Ignore cache deletion errors; a fresh cache will be written later.
        }
    }

    private static async readModelCacheFromDisk(
        logger?: Logger
    ): Promise<ModelCache | null> {
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

            if (error instanceof SyntaxError) {
                const cacheFile = PayeeTransformer.getCacheFilePath();
                logger?.warn(
                    'OpenAI model cache was corrupted and has been reset.',
                    [`Path: ${cacheFile}`, `Parse error: ${error.message}`]
                );
                await PayeeTransformer.deleteModelCacheFile();
            }

            return null;
        }
    }

    private static async writeModelCacheToDisk(
        cache: ModelCache
    ): Promise<void> {
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
            maxRetries: 0,
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

            const finishReason = response.choices[0]?.finish_reason;
            if (finishReason && finishReason !== 'stop') {
                this.logger.error(
                    `OpenAI response ended prematurely (finish_reason: ${finishReason}).`
                );
                if (!this.shouldMaskPayeeLogs()) {
                    this.logger.debug(
                        `Raw response content may be truncated: ${response.choices[0].message.content}`
                    );
                }
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

                // Check for empty payload
                if (Object.keys(transformedPayees).length === 0) {
                    this.logger.warn(
                        'OpenAI returned empty payload, falling back to original payee names',
                        [
                            'This may indicate the model failed to process the request properly',
                        ]
                    );
                    return this.buildResponse(uniquePayees);
                }

                // Check for duplicate keys by parsing the raw JSON string
                // This is necessary because JSON.parse will silently use the last duplicate key
                const rawKeys = this.extractKeysFromJsonString(output);
                const uniqueRawKeys = new Set(rawKeys);
                if (rawKeys.length !== uniqueRawKeys.size) {
                    this.logger.warn(
                        'OpenAI response contains duplicate keys, falling back to original payee names',
                        ['This indicates malformed response structure']
                    );
                    return this.buildResponse(uniquePayees);
                }

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
    ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
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
                    const requestedTemperature =
                        this.config.modelConfig.temperature;
                    requestConfig.temperature = Math.min(
                        2,
                        Math.max(0, requestedTemperature)
                    );
                }

                if (
                    capabilities.supportsMaxTokens &&
                    this.config.modelConfig?.maxTokens !== undefined
                ) {
                    const requestedMaxTokens =
                        this.config.modelConfig.maxTokens;
                    requestConfig.max_tokens = Math.min(
                        4096,
                        Math.max(64, requestedMaxTokens)
                    );
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
                            setTimeout(resolve, 1000 * 2 ** (attempt - 1))
                        ); // Exponential backoff
                        continue;
                    }
                }
                throw error;
            }
        }

        throw new Error('Failed to complete OpenAI request');
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

    private async getConfiguredModel(): Promise<string> {
        if (this.config.skipModelValidation) {
            this.logger.debug('Skipping OpenAI model validation.');
            return this.config.openAiModel;
        }

        const availableModels = await this.getAvailableModels();

        if (!availableModels.includes(this.config.openAiModel)) {
            this.logger.error(
                `The specified model '${this.config.openAiModel}' is invalid. The following models are available:`,
                this.summarizeLogEntries(availableModels)
            );
            throw new Error('Invalid OpenAI model specified.');
        }

        return this.config.openAiModel;
    }

    private async getAvailableModels(): Promise<Array<string>> {
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

        const diskCache = await PayeeTransformer.readModelCacheFromDisk(
            this.logger
        );
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
            this.logger.error(
                'Failed to fetch OpenAI model list',
                err instanceof Error ? err.message : String(err)
            );
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

    private generatePrompt(): string {
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

    private handleError(error: unknown): void {
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

    private shouldMaskPayeeLogs(): boolean {
        return this.config.maskPayeeNamesInLogs;
    }

    private formatPayeeListForLog(payees: Array<string>): Array<string> {
        const prepared = this.shouldMaskPayeeLogs()
            ? payees.map((payee) => this.obfuscatePayeeName(payee))
            : payees;

        return this.summarizeLogEntries(prepared);
    }

    private formatPayeeMappingForLog(
        mappings: Record<string, string>
    ): Array<string> {
        const shouldMask = this.shouldMaskPayeeLogs();

        const formatted = Object.entries(mappings).map(
            ([original, transformed]) => {
                const displayOriginal = shouldMask
                    ? this.obfuscatePayeeName(original)
                    : original;
                const displayTransformed = shouldMask
                    ? this.obfuscatePayeeName(transformed)
                    : transformed;

                return `  "${displayOriginal}" → "${displayTransformed}"`;
            }
        );

        return this.summarizeLogEntries(formatted);
    }

    private summarizeLogEntries(entries: Array<string>): Array<string> {
        if (entries.length <= MAX_LOG_ENTRIES) {
            return entries;
        }

        const visibleEntries = entries.slice(0, MAX_LOG_ENTRIES);
        const remaining = entries.length - MAX_LOG_ENTRIES;
        return [...visibleEntries, `…and ${remaining} more`];
    }

    private obfuscatePayeeName(payee: string): string {
        const chars = Array.from(payee); // code point–aware
        if (chars.length <= 2) {
            return '•'.repeat(Math.max(chars.length, 1));
        }
        const firstChar = chars[0];
        const lastChar = chars[chars.length - 1];
        const middle = '•'.repeat(chars.length - 2);
        return `${firstChar}${middle}${lastChar}`;
    }

    private buildResponse(payees: Array<string>): Record<string, string> {
        return payees.reduce(
            (acc, payee) => {
                acc[payee] = this.transformationCache.get(payee) ?? payee;
                return acc;
            },
            {} as Record<string, string>
        );
    }

    private extractKeysFromJsonString(jsonString: string): string[] {
        // Simple regex to extract keys from JSON string
        // This matches quoted strings followed by a colon
        const keyRegex = /"([^"]+)":/g;
        const keys: string[] = [];
        let match;

        while ((match = keyRegex.exec(jsonString)) !== null) {
            if (match[1]) {
                keys.push(match[1]);
            }
        }

        return keys;
    }
}

export default PayeeTransformer;
