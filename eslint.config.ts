import eslint from '@eslint/js';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

const { config: defineConfig, configs: tsConfigs } = tseslint;

const enableComplexityRules = process.env.ENABLE_COMPLEXITY_RULES === 'true';

const complexityRules = enableComplexityRules
    ? {
          complexity: ['error', { max: 40 }],
          'sonarjs/cognitive-complexity': ['error', 60],
      }
    : {};

const sharedRules = {
    '@typescript-eslint/no-unused-vars': [
        'error',
        {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
        },
    ],
};

export default defineConfig(
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.js'],
    },
    eslint.configs.recommended,
    tsConfigs.recommended,
    defineConfig({
        files: [
            'src/**/*.ts',
            'scripts/**/*.ts',
            '*.config.ts',
            'vitest.config.ts',
        ],
        languageOptions: {
            globals: globals.node,
        },
        plugins: {
            sonarjs,
        },
        rules: {
            ...sharedRules,
            ...complexityRules,
        },
    }),
    defineConfig({
        files: ['tests/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.vitest,
            },
        },
        plugins: {
            sonarjs,
        },
        rules: sharedRules,
    })
);
