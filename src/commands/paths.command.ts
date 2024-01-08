import prompts from 'prompts';
import { CommandModule } from 'yargs';
import { SharedDependencies } from '../index.js';
import envPaths from '../utils/envPaths.js';

const handlePaths = async (dependencies: SharedDependencies, argv: any) => {
    console.log("Config path", envPaths.config)
    console.log("Data path", envPaths.data)
    console.log("Cache path", envPaths.cache)
};

export default (dependencies: SharedDependencies) =>
    ({
        command: 'paths',
        describe: 'Print the storage paths.',
        builder: (yargs) => {
            return yargs;
        },
        handler: (argv) => handlePaths(dependencies, argv),
    } as CommandModule);
