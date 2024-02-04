import prompts from 'prompts';
import { CommandModule } from 'yargs';
import db from '../utils/db.js';
import prisma from '@prisma/client';
import actualApi from '../utils/actual.js';
import { getConfig } from '../utils/config.js';

const handleAdd = async (argv: any) => {
    const defaultValues = {
        serverURL: 'http://localhost:5006',
    };

    await getConfig();

    const { syncId, e2eEncryptionEnabled, e2eEncryptionPassword, name } =
        await prompts([
            {
                type: 'text',
                name: 'syncId',
                message: 'What is the sync ID of your budget?',
                initial: argv.syncId ?? '',
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
                type: 'text',
                name: 'name',
                message:
                    'Please give this budget a recognizable name/identifier:',
                initial: 'personal',
                validate: (value) =>
                    value.length > 0 ? true : 'Name cannot be empty',
            },
            {
                type: 'toggle',
                name: 'e2eEncryptionEnabled',
                message: 'Does this budget use end-to-end encryption?',
                initial: false,
                active: 'yes',
                inactive: 'no',
            },
            {
                type: (prev) => (prev === true ? 'password' : null),
                name: 'e2eEncryptionPassword',
                message: 'Please enter your end-to-end encryption password:',
                validate: (value) =>
                    value.length > 0 ? true : 'Password cannot be empty',
            },
        ]);

    await db.budget.create({
        data: {
            syncId,
            e2ePassword: e2eEncryptionEnabled
                ? e2eEncryptionPassword
                : undefined,
            name,
        },
    });

    console.log('Setup complete!');
};

const handleRemove = async (argv: any) => {
    await getConfig();

    const actualFile = await db.budget.findFirst({
        where: {
            syncId: argv.syncId ?? undefined,
        },
    });

    if (!actualFile) {
        console.log(
            `No file found with the sync ID: '${argv.syncId}'. Please run 'file add' first.`
        );
        return;
    }

    await db.budget.delete({
        where: {
            syncId: argv.syncId,
        },
    });

    console.log(`File with sync ID: '${argv.syncId}' removed.`);
};

const handleList = async (argv: any) => {
    await getConfig();

    const actualFiles = await db.budget.findMany();

    console.table(actualFiles, ['syncId', 'name']);
};

export default () =>
    ({
        command: 'budget [action] [syncId]',
        describe: 'Manage imports for different files inside Actual',
        builder: (yargs) => {
            yargs.positional('action', {
                type: 'string',
                describe: 'The action to perform',
                choices: ['add', 'remove', 'list'],
            });

            yargs.positional('syncId', {
                type: 'string',
                describe: 'The sync ID of the file',
            });

            return yargs;
        },
        handler: async (argv) => {
            if (argv.action === 'add') {
                await handleAdd(argv);
            } else if (argv.action === 'remove') {
                await handleRemove(argv);
            } else if (argv.action === 'list') {
                await handleList(argv);
            }
        },
    }) as CommandModule;
