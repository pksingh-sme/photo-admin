import type { TwoTenants } from './test/fixtures/two-tenants.js';

declare module 'vitest' {
  interface TestContext {
    tenants: TwoTenants;
  }
}

export {};
