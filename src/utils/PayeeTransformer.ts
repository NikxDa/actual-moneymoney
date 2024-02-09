import { Configuration, OpenAIApi } from 'openai';

class PayeeTransformer {
    private openai: OpenAIApi;

    constructor(openAiApiKey: string) {
        const configuration = new Configuration({
            apiKey: openAiApiKey,
        });

        this.openai = new OpenAIApi(configuration);
    }

    public async transformPayees(payeeList: string[]) {
        const prompt = this.generatePrompt();

        try {
            const response = await this.openai.createChatCompletion({
                model: 'gpt-3.5-turbo',
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: payeeList.join('\n') },
                ],
                temperature: 0,
            });

            const output = response.data.choices[0].message?.content as string;
            return JSON.parse(output) as { [key: string]: string };
        } catch (e) {
            return null;
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
