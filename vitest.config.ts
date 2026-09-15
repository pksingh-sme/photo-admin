import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const testBase = {
  environment: 'node' as const,
  setupFiles: ['./vitest.setup.ts'],
};

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    ...testBase,
    projects: [
      {
        test: {
          ...testBase,
          name: 'unit',
          include: [
            'src/**/*.spec.ts',
            'src/**/*.test.ts',
            'scripts/**/*.spec.ts',
            'test/money/**/*.spec.ts',
            'test/money/**/*.test.ts',
            'test/authz/**/*.spec.ts',
            'test/authz/**/*.test.ts',
            'test/contract/**/*.spec.ts',
            'test/contract/**/*.test.ts',
            'test/docker/**/*.spec.ts',
            'test/docker/**/*.test.ts',
          ],
        },
      },
      {
        test: {
          ...testBase,
          name: 'tenancy',
          include: ['test/tenancy/**/*.spec.ts', 'test/tenancy/**/*.test.ts'],
        },
      },
    ],
  },
});
