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

    const availableBudgets = await actualApi.getUserFiles();
    const existingBudgets = await db.budgetConfig.findMany();

    const budgetsNotYetAdded = availableBudgets.filter(
        (budget) =>
            !existingBudgets.find(
                (existing) => existing.syncId === budget.groupId
            )
    );

    if (budgetsNotYetAdded.length === 0) {
        console.log('All available budgets are already added.');
        return;
    }

    const promptsResult = await prompts([
        {
            type: 'select',
            name: 'syncId',
            message: 'Which budget do you want to add?',
            choices: budgetsNotYetAdded.map((budget) => ({
                title: budget.name,
                value: budget.groupId,
            })),
        },
        {
            type: 'text',
            name: 'name',
            message: 'Please give this budget a recognizable name/identifier:',
            initial: (prev) =>
                argv.name ??
                budgetsNotYetAdded.find((budget) => budget.groupId === prev)!
                    .name,
            validate: async (value) => {
                if (value.length === 0) {
                    return 'The name cannot be empty';
                }

                if (
                    existingBudgets.find((existing) => existing.name === value)
                ) {
                    return 'A budget with this name already exists';
                }

                return true;
            },
        },
        {
            type: (_, values) =>
                !!budgetsNotYetAdded.find(
                    (budget) => budget.groupId === values.syncId
                )!.encryptKeyId
                    ? 'password'
                    : null,
            name: 'e2eEncryptionPassword',
            message:
                'This budget is end-to-end encrypted, please enter your encryption password:',
            validate: (value) =>
                value.length > 0 ? true : 'Password cannot be empty',
        },
    ]);

    if (Object.keys(promptsResult).length === 0) {
        console.log('Setup cancelled');
        process.exit(0);
    }

    const { syncId, name, e2eEncryptionPassword } = promptsResult;

    const budgetToImport = budgetsNotYetAdded.find(
        (budget) => budget.groupId === syncId
    )!;

    await db.budgetConfig.create({
        data: {
            syncId,
            e2ePassword: !!budgetToImport.encryptKeyId
                ? e2eEncryptionPassword
                : undefined,
            name,
            originalName: budgetToImport.name,
        },
    });

    console.log('Budget added successfully!');
};

const handleRemove = async (argv: any) => {
    await getConfig();

    const nameToRemove = argv.name;
    if (!nameToRemove) {
        console.log('Please provide a budget name to remove.');
        return;
    }

    const actualFile = await db.budgetConfig.findFirst({
        where: {
            name: nameToRemove,
        },
    });

    if (!actualFile) {
        console.log(
            `No file found with the sync ID: '${argv.syncId}'. Please run 'file add' first.`
        );
        return;
    }

    await db.budgetConfig.delete({
        where: {
            syncId: actualFile.syncId,
        },
    });

    console.log(
        `File '${argv.name}' with sync ID: '${actualFile.syncId}' removed.`
    );
};

const handleList = async (argv: any) => {
    await getConfig();

    const actualFiles = await db.budgetConfig.findMany();

    console.table(actualFiles, ['name', 'originalName', 'syncId']);
};

export default () =>
    ({
        command: 'budget [action] [name]',
        describe: 'Manage budget configurations for import',
        builder: (yargs) => {
            yargs.positional('action', {
                type: 'string',
                describe: 'The action to perform',
                choices: ['add', 'remove', 'list'],
            });

            yargs.positional('name', {
                type: 'string',
                describe: 'The name of the budget',
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
