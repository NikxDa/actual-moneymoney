import prompts from 'prompts';
import { CommandModule } from 'yargs';
import { SharedDependencies } from '../index.js';

const handleSetup = async (dependencies: SharedDependencies, argv: any) => {
    const { config, cache } = dependencies;

    await config.load();
    await cache.load();

    const defaultValues = {
        serverURL: 'http://localhost:5006',
    };

    const {
        serverURL,
        password,
        syncID,
        encryptionEnabled,
        openaiApiKey,
        useAIPayeeTransformation,
    } = await prompts([
        {
            type: 'text',
            name: 'serverURL',
            message: 'What is the URL of your running server?',
            initial: config.data.actualApi.serverURL ?? defaultValues.serverURL,
            validate: (value) => {
                if (value.length === 0) {
                    return 'Server URL cannot be empty';
                }

                if (!/^https?:\/\//.test(value)) {
                    return 'Server URL must start with http:// or https://';
                }

                return true;
            },
        },
        {
            type: 'text',
            name: 'syncID',
            message: 'What is the sync ID of your budget?',
            initial: config.data.actualApi.syncID ?? '',
            validate: (value) => {
                if (value.length === 0) {
                    return 'Sync ID cannot be empty';
                }

                if (value.length !== 36 || !value.includes('-')) {
                    return 'Sync ID must be a valid UUID';
                }

                return true;
            },
        },
        {
            type: 'password',
            name: 'password',
            message: 'What is the password of your budget?',
            initial: config.data.actualApi.password ?? '',
            validate: (value) =>
                value.length > 0 ? true : 'Password cannot be empty',
        },
        {
            type: 'toggle',
            name: 'encryptionEnabled',
            message:
                'Have you set up your Actual server to use end-to-end encryption?',
            hint: `Currently configured as: ${
                config.data.actualApi.password ? 'yes' : 'no'
            }`,
            initial: false,
            active: 'yes',
            inactive: 'no',
        },
        {
            type: 'toggle',
            name: 'useAIPayeeTransformation',
            message:
                'Do you want to use OpenAI to transform payee names to a human-readable format?',
            hint: `An OpenAI API key is required. Currently confugured as: ${
                config.data.useAIPayeeTransformation ? 'yes' : 'no'
            }`,
            initial: false,
            active: 'yes',
            inactive: 'no',
        },
        {
            type: (prev) => (prev === true ? 'password' : null),
            name: 'openaiApiKey',
            initial: config.data.openaiApiKey,
            message: 'Please enter your OpenAI API key:',
            hint: 'You can generate one at https://platform.openai.com/account/api-keys',
        },
    ]);

    if (syncID && syncID !== config.data.actualApi.syncID) {
        const clearCachePrompt = await prompts({
            type: 'toggle',
            name: 'clearCache',
            message:
                'Your sync ID has changed. Do you want to clear the import cache and account mapping?',
            initial: false,
            active: 'yes',
            inactive: 'no',
        });

        if (clearCachePrompt.clearCache) {
            cache.data.accountMap = {};
            cache.data.importedTransactions = [];
        }
    }

    config.data.actualApi = {
        serverURL,
        password,
        syncID,
        encryptionEnabled,
    };

    config.data.useAIPayeeTransformation = useAIPayeeTransformation;
    config.data.openaiApiKey = openaiApiKey;

    await config.save();
    await cache.save();

    console.log('Setup complete!');
};

export default (dependencies: SharedDependencies) =>
    ({
        command: 'setup',
        describe: 'Setup the importer',
        builder: (yargs) => {
            return yargs;
        },
        handler: (argv) => handleSetup(dependencies, argv),
    } as CommandModule);
