import OpenAI from 'openai';
import Logger from './Logger.js';
import { PayeeTransformationConfig } from './config.js';

interface ModelCapabilities {
    supportsTemperature: boolean;
    supportsMaxTokens: boolean;
    defaultTemperature: number;
}

type ExtendedChatCompletionCreateParams =
    OpenAI.Chat.Completions.ChatCompletionCreateParams & {
        temperature?: number;
    };

class PayeeTransformer {
    private openai: OpenAI;
    private availableModels: Array<string> | null = null;
    private modelListInitialized = false;
    private modelCapabilities: Map<string, ModelCapabilities> = new Map();

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

    public async transformPayees(payeeList: string[]) {
        const prompt = this.generatePrompt();

        if (payeeList.length === 0) {
            this.logger.debug(
                'No payees to transform. Returning empty object.'
            );
            return {};
        }

        // Log original payee names at DEBUG level
        this.logger.debug('Original payee names:', payeeList);

        try {
            this.logger.debug(`Starting payee transformation...`, [
                `Payees: ${payeeList.length}`,
                `Model: ${this.config.openAiModel}`,
            ]);

            // Validate model before proceeding
            const model = await this.getConfiguredModel();

            const response = await this.makeOpenAIRequest(
                prompt,
                payeeList,
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

                // Log transformed payee names at DEBUG level
                this.logger.debug('Payee transformation completed:', [
                    'Original → Transformed:',
                    ...Object.entries(transformedPayees).map(
                        ([original, transformed]) =>
                            `  "${original}" → "${transformed}"`
                    ),
                ]);

                return transformedPayees;
            } catch (parseError) {
                this.logger.error(
                    `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
                );
                this.logger.debug(`Raw response: ${output}`);
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
        // Only fetch models once per instance
        if (!this.modelListInitialized) {
            this.logger.debug('Initializing model list...');
            const response = await this.openai.models.list();
            this.availableModels = response.data.map((m) => m.id);
            this.modelListInitialized = true;
            this.logger.debug(
                `Found ${this.availableModels.length} available models.`
            );
        } else {
            this.logger.debug('Using cached model list.');
        }

        if (!this.availableModels!.includes(this.config.openAiModel)) {
            this.logger.error(
                `The specified model '${this.config.openAiModel}' is invalid. The following models are available:`,
                this.availableModels!
            );
            throw new Error('Invalid OpenAI model specified.');
        }

        return this.config.openAiModel;
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
}

export default PayeeTransformer;
