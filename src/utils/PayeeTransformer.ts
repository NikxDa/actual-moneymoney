import OpenAI from 'openai';
import Logger from './Logger.js';
import { PayeeTransformationConfig } from './config.js';

class PayeeTransformer {
    private openai: OpenAI;

    constructor(
        private config: PayeeTransformationConfig,
        private logger: Logger
    ) {
        if (!config.openAiApiKey) {
            throw new Error(
                'An OpenAPI API key is required for payee transformation. Please set the key in the configuration file.'
            );
        }

        this.openai = new OpenAI({
            apiKey: config.openAiApiKey,
        });
    }

    public async transformPayees(payeeList: string[]) {
        const prompt = this.generatePrompt();

        try {
            this.logger.debug(
                `Starting payee transformation with model '${this.config.openAiModel}'...`
            );

            // Validate model before proceeding
            const model = await this.getConfiguredModel();

            const response = await this.openai.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: payeeList.join('\n') },
                ],
                response_format: {
                    type: 'json_object',
                },
                temperature: 0,
            });

            const output = response.choices[0].message?.content as string;

            try {
                return JSON.parse(output) as { [key: string]: string };
            } catch (parseError) {
                this.logger.error(
                    `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
                );
                this.logger.debug(`Raw response: ${output}`);
                return null;
            }
        } catch (error) {
            if (error instanceof Error) {
                this.logger.error(
                    `Error in payee transformation: ${error.message}`
                );
            }
            return null;
        }
    }

    private async getConfiguredModel() {
        this.logger.debug('Listing available models...');

        const modelsIterator = await this.openai.models.list();
        const availableModels = (await Array.fromAsync(modelsIterator)).map(
            (m) => m.id
        );

        this.logger.debug(`Available models: ${availableModels.join(', ')}`);

        if (!availableModels.includes(this.config.openAiModel)) {
            throw new Error(
                `The specified model '${this.config.openAiModel}' is invalid. The following models are available: ${availableModels.join(', ')}`
            );
        }

        return this.config.openAiModel;
    }

    private generatePrompt() {
        return `
            You are now a model trained to classify bank account transactions. You will receive
            a list of payees as they appear in the source transactions, and you will return
            a cleaned up, human-readable version of the payees. Return a JSON formatted object, where
            the old payee names are mapped to the new ones. Make sure the new payee names are clear
            and concise, and omit any unnecessary details. For example, if the payee is "Amazon.com",
            you should return "Amazon". If the payee is "AMAZON.COM/BILLWA", you should also return
            "Amazon". You are free to make some assumptions about the payees. If you don't know the
            payee, return "Unknown". If for some reason you cannot create a JSON object, return {}.

            Examples:

            Input: -
            Output: {}

            Input: Amzn Mktp US*1234567890
            Output: { "Amzn Mktp US*1234567890": "Amazon" }

            Input: AMAZON.COM/BILLWA\nAMAZON.COM
            Output: { "AMAZON.COM/BILLWA": "Amazon", "AMAZON.COM": "Amazon" }

            If there is no list, return an empty object. Do not under any circumstances return anything that
            is not valid JSON.
        `;
    }
}

export default PayeeTransformer;
