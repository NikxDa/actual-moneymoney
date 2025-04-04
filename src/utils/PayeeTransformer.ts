import OpenAI from 'openai';

interface PayeeTransformerConfig {
    openAiModel: string;
    openAiApiKey: string;
}

class PayeeTransformer {
    private openai: OpenAI;
    private config: PayeeTransformerConfig;

    constructor(config: PayeeTransformerConfig) {
        this.config = config;
        this.openai = new OpenAI({
            apiKey: config.openAiApiKey,
        });
    }

    public async transformPayees(payeeList: string[]) {
        const prompt = this.generatePrompt();

        try {
            // Validate model before proceeding
            await this.validateModel();

            const response = await this.openai.chat.completions.create({
                model: this.config.openAiModel,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: payeeList.join('\n') },
                ],
                temperature: 0,
            });

            const output = response.choices[0].message?.content as string;
            return JSON.parse(output) as { [key: string]: string };
        } catch (error) {
            if (error instanceof Error) {
                console.error(`Error in transformPayees: ${error.message}`);
            }
            return null;
        }
    }

    private async validateModel() {
        try {
            const models = await this.openai.models.list();
            const availableModels = models.data.map((model) => model.id);

            if (!availableModels.includes(this.config.openAiModel)) {
                throw new Error(
                    `Model "${this.config.openAiModel}" is not available. Available models are: ${availableModels.join(', ')}`
                );
            }
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to validate model: ${error.message}`);
            }
            throw error;
        }
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
