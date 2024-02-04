import prompts from 'prompts';
import { CommandModule } from 'yargs';
import db from '../utils/db.js';
import prisma from '@prisma/client';

const handleSetup = async (argv: any) => {
    const defaultValues = {
        serverURL: 'http://localhost:5006',
    };

    const currentConfig = await db.config.findFirst();

    const {
        serverURL,
        serverPassword,
        aiPayeeTransformationEnabled,
        openaiApiKey,
    } = await prompts([
        {
            type: 'text',
            name: 'serverURL',
            message: 'What is the URL of your running server?',
            initial: currentConfig?.actualServerUrl ?? defaultValues.serverURL,
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
            type: 'password',
            name: 'serverPassword',
            message: 'What is the password of your server?',
            initial: currentConfig?.actualServerPassword ?? '',
            validate: (value) =>
                value.length > 0 ? true : 'Password cannot be empty',
        },
        {
            type: 'toggle',
            name: 'aiPayeeTransformationEnabled',
            message:
                'Do you want to use OpenAI to transform payee names to a human-readable format?',
            hint: `An OpenAI API key is required. Currently confugured as: ${
                !!currentConfig?.openAIApiKey ? 'yes' : 'no'
            }`,
            initial: false,
            active: 'yes',
            inactive: 'no',
        },
        {
            type: (prev) => (prev === true ? 'password' : null),
            name: 'openaiApiKey',
            initial: currentConfig?.openAIApiKey ?? '',
            message: 'Please enter your OpenAI API key:',
            hint: 'You can generate one at https://platform.openai.com/account/api-keys',
            validate: (value) =>
                value.length > 0 ? true : 'OpenAI API key cannot be empty',
        },
    ]);

    const config = {
        actualServerUrl: serverURL,
        actualServerPassword: serverPassword,
        openAIApiKey:
            aiPayeeTransformationEnabled && openaiApiKey ? openaiApiKey : null,
    };

    await db.config.upsert({
        where: {
            id: 1,
        },
        create: config,
        update: config,
    });

    console.log('Setup complete!');
};

export default () =>
    ({
        command: 'setup',
        describe: 'Setup the importer',
        builder: (yargs) => {
            return yargs;
        },
        handler: (argv) => handleSetup(argv),
    }) as CommandModule;
