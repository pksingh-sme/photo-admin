import 'reflect-metadata';
import { beforeEach } from 'vitest';
import { createTwoTenants } from './test/fixtures/two-tenants.js';

beforeEach((context) => {
  context.tenants = createTwoTenants();
});
