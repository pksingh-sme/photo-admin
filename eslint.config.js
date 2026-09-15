import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import { zodInferRequestParamsRule } from './scripts/eslint-rules/zod-infer-request-params.mjs';

const photoprintPlugin = {
  rules: {
    'zod-infer-request-params': zodInferRequestParamsRule,
  },
};

const CREATE_POOL_MESSAGE =
  'createPool may be called only in src/data/internal/client.ts. A second pool bypasses DECIMAL flags and the tenant-scope hook.';

const INTERNAL_IMPORT_MESSAGE =
  'src/data/internal may be imported only by src/data/scoped.ts and src/data/tenant-scope-hook.ts. Repositories use scoped().';

const DB_DRIVER_MESSAGE =
  'The pool and Drizzle instance live in src/data/internal/client.ts. Use scoped() or a repository.';

const syntaxBoundary = [
  {
    selector: "CallExpression[callee.name='createRequire']",
    message:
      'createRequire is banned; it bypasses the data-access import boundary.',
  },
  {
    selector: "ImportExpression[source.value=/^(node:)?mysql2\\b/]",
    message: DB_DRIVER_MESSAGE,
  },
  {
    selector: "ImportExpression[source.value=/^drizzle-orm\\b/]",
    message: DB_DRIVER_MESSAGE,
  },
  {
    selector:
      "TSAsExpression[typeAnnotation.typeName.name='TenantContext']",
    message:
      'TenantContext cannot be asserted into existence. Use tenantContextFromPrincipal() after verifying credentials.',
  },
];

const MONEY_NUMBER_MESSAGE =
  'Monetary values never pass through a JS number. Use Money.';

const syntaxMoneyNumber = [
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message: MONEY_NUMBER_MESSAGE,
  },
  {
    selector: "CallExpression[callee.property.name='parseFloat']",
    message: MONEY_NUMBER_MESSAGE,
  },
  {
    selector: "CallExpression[callee.name='Number']",
    message: MONEY_NUMBER_MESSAGE,
  },
  {
    selector: "UnaryExpression[operator='+']",
    message: MONEY_NUMBER_MESSAGE,
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: MONEY_NUMBER_MESSAGE,
  },
];

const syntaxCreatePool = [
  {
    selector: "CallExpression[callee.name='createPool']",
    message: CREATE_POOL_MESSAGE,
  },
  {
    selector: "CallExpression[callee.property.name='createPool']",
    message: CREATE_POOL_MESSAGE,
  },
];

const RAW_REQUEST_MESSAGE =
  'Raw request access defeats FR-API-003 enforcement. Use typed parameters.';

const syntaxRawRequest = [
  {
    selector:
      "Decorator[expression.callee.name=/^(Req|Res|Request|Response|Next)$/]",
    message: RAW_REQUEST_MESSAGE,
  },
  {
    selector: "Decorator[expression.name=/^(Req|Res|Request|Response|Next)$/]",
    message: RAW_REQUEST_MESSAGE,
  },
];

const internalImportPatterns = [
  '**/data/internal',
  '**/data/internal/**',
  '**/data/internal/*',
  '**/internal/client',
  '**/internal/client.*',
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'infra/cdk.out/**',
      'infra/node_modules/**',
      'scripts/__fixtures__/**',
      '**/.gitkeep',
      'package-lock.json',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**', 'scripts/**', 'test/**', 'infra/**'],
    languageOptions: {
      globals: {
        ...globals.node,
        // @types/node namespace; no-undef does not see TypeScript namespaces.
        NodeJS: 'readonly',
      },
    },
    rules: {
      // typescript-eslint turns no-undef off for *.ts (tsc already reports
      // undeclared names). Re-enable it here so a browser global in server
      // code fails lint, not only tsc — globals.node does not include window.
      'no-undef': 'error',
    },
  },
  {
    files: ['apps/admin-ui/**'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-syntax': ['error', ...syntaxBoundary, ...syntaxCreatePool],
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
              message: DB_DRIVER_MESSAGE,
            },
            {
              name: 'mysql2/promise',
              message: DB_DRIVER_MESSAGE,
            },
          ],
          patterns: [
            {
              group: ['drizzle-orm/*', 'mysql2/*'],
              message:
                'Database access is only permitted inside src/data/. Use a repository.',
            },
            {
              group: internalImportPatterns,
              message: INTERNAL_IMPORT_MESSAGE,
            },
            {
              group: ['**/data/client', '**/data/client.*'],
              message: DB_DRIVER_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'mysql2',
              message: DB_DRIVER_MESSAGE,
            },
            {
              name: 'mysql2/promise',
              message: DB_DRIVER_MESSAGE,
            },
          ],
          patterns: [
            {
              group: ['mysql2/*', 'drizzle-orm/mysql2'],
              message: DB_DRIVER_MESSAGE,
            },
            {
              group: internalImportPatterns,
              message: INTERNAL_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/scoped.ts', 'src/data/tenant-scope-hook.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'mysql2',
              message: DB_DRIVER_MESSAGE,
            },
            {
              name: 'mysql2/promise',
              message: DB_DRIVER_MESSAGE,
            },
          ],
          patterns: [
            {
              group: ['mysql2/*', 'drizzle-orm/mysql2'],
              message: DB_DRIVER_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/internal/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': ['error', ...syntaxBoundary],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'test/tenancy/**/*.ts'],
    plugins: {
      vitest,
    },
    rules: {
      'vitest/no-focused-tests': 'error',
    },
  },
  {
    files: ['src/modules/**/*.ts', 'src/**/*.controller.ts'],
    plugins: {
      photoprint: photoprintPlugin,
    },
    rules: {
      'photoprint/zod-infer-request-params': 'error',
      'no-restricted-syntax': [
        'error',
        ...syntaxBoundary,
        ...syntaxCreatePool,
        ...syntaxRawRequest,
      ],
    },
  },
  {
    files: [
      'src/money/**/*.ts',
      'src/modules/pricing/**/*.ts',
      'src/modules/cart/**/*.ts',
      'src/modules/tax/**/*.ts',
      'src/modules/vouchers/**/*.ts',
      'src/modules/orders/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...syntaxBoundary,
        ...syntaxCreatePool,
        ...syntaxMoneyNumber,
        ...syntaxRawRequest,
      ],
    },
  },
);
