import path from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from '@eslint/js';
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

const { config: defineConfig, configs: tsConfigs } = tseslint;

const enableComplexityRules = process.env.ENABLE_COMPLEXITY_RULES === 'true';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const eslintProject = path.resolve(__dirname, 'tsconfig.eslint.json');

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
    '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
            accessibility: 'explicit',
            overrides: {
                accessors: 'explicit',
                constructors: 'no-public',
                methods: 'explicit',
                properties: 'explicit',
                parameterProperties: 'explicit',
            },
        },
    ],
    'no-unreachable': 'error',
};

export default defineConfig(
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.js', '**/*.mjs'],
    },
    eslint.configs.recommended,
    tsConfigs.recommended,
    defineConfig({
        files: ['src/**/*.ts', 'scripts/**/*.ts', '*.config.ts', 'vitest.config.ts'],
        languageOptions: {
            globals: globals.node,
            parserOptions: {
                project: eslintProject,
                tsconfigRootDir: __dirname,
            },
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
        files: ['src/utils/config-format.ts'],
        rules: {
            '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: false }],
            '@typescript-eslint/strict-boolean-expressions': [
                'warn',
                {
                    allowString: false,
                    allowNumber: false,
                    allowNullableObject: false,
                    allowNullableBoolean: false,
                    allowNullableString: false,
                    allowNullableNumber: false,
                    allowAny: false,
                },
            ],
        },
    }),
    defineConfig({
        files: ['tests/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.vitest,
            },
            parserOptions: {
                project: eslintProject,
                tsconfigRootDir: __dirname,
            },
        },
        plugins: {
            sonarjs,
        },
        rules: {
            ...sharedRules,
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
        },
    })
);
