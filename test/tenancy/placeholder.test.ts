import {
  assertTenantIsolation,
  type IsolationRecord,
  type TenantIsolationFactory,
} from './assert-tenant-isolation.js';

const NO_ENTITY = 'no tenant-owned entity exists yet (FR-TEN-010)';

async function notImplemented(): Promise<never> {
  throw new Error(NO_ENTITY);
}

const placeholderFactory: TenantIsolationFactory<IsolationRecord> = {
  create: notImplemented,
  read: notImplemented,
  update: notImplemented,
  delete: notImplemented,
  list: notImplemented,
};

assertTenantIsolation('placeholder', placeholderFactory);
