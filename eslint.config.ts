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

export default defineConfig(
    eslint.configs.recommended,
    tsConfigs.recommended,
    defineConfig({
        files: ['src/**/*.ts'],
        ignores: ['**/*.js'],
        languageOptions: {
            globals: globals.node,
        },
        plugins: {
            sonarjs,
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
            ...complexityRules,
        },
    })
);
