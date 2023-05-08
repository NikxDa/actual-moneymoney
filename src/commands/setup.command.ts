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

    const { serverURL, password, syncID } = await prompts([
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
        // {
        //     type: 'toggle',
        //     name: 'encryptionEnabled',
        //     message:
        //         'Have you set up your Actual server to use end-to-end encryption?',
        //     hint: `Currently configured as: ${
        //         existingConfig?.actualApi.password ? 'yes' : 'no'
        //     }`,
        //     initial: false,
        //     active: 'yes',
        //     inactive: 'no',
        // },
        // {
        //     type: (prev) => (prev === true ? 'password' : null),
        //     name: 'encryptionPassword',
        //     message: 'What is the password used for the end-to-end encryption?',
        // },
    ]);

    if (syncID && syncID !== config.data.actualApi.syncID) {
        cache.data.accountMap = {};
        cache.data.importedTransactions = [];
    }

    config.data.actualApi = {
        serverURL,
        password,
        syncID,
    };

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
