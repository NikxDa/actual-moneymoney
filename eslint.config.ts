import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const { config: defineConfig, configs: tsConfigs } = tseslint;

export default defineConfig(
    eslint.configs.recommended,
    tsConfigs.recommended,
    defineConfig({
        files: ['src/**/*.ts'],
        ignores: ['**/*.js'],
        languageOptions: {
            globals: globals.node,
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    })
);
