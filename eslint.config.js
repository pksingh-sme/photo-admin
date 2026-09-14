import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/.gitkeep',
      'package-lock.json',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'drizzle-orm',
              message:
                'Database access is only permitted inside src/data/. Use a repository.',
            },
            {
              name: 'mysql2',
              message:
                'Database access is only permitted inside src/data/. Use a repository.',
            },
          ],
          patterns: [
            {
              group: [
                'drizzle-orm/*',
                'mysql2/*',
                '**/data/client',
                '**/data/client.*',
              ],
              message:
                'Database access is only permitted inside src/data/. Use a repository.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    plugins: {
      vitest,
    },
    rules: {
      'vitest/no-focused-tests': 'error',
    },
  },
);
