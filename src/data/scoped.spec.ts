import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { describe, expect, it } from 'vitest';
import type { Database } from './client.js';
import { scoped } from './scoped.js';
import type { TenantOwnedTable } from './schema/tenant-owned.js';
import { tenantOwned } from './schema/tenant-owned.js';
import type { TenantContext } from '../platform/tenant/tenant-context.js';
import {
  principalFromVerifiedCredentials,
  tenantContextFromPrincipal,
} from '../platform/tenant/tenant-context.js';

const widgets = tenantOwned('scoped_type_widgets', {
  id: varchar('id', { length: 36 }).notNull(),
});

const platforms = mysqlTable('scoped_type_platforms', {
  id: varchar('id', { length: 36 }).notNull(),
});

const lookalike = mysqlTable('scoped_type_lookalike', {
  oemId: varchar('oem_id', { length: 36 }).notNull(),
  id: varchar('id', { length: 36 }).notNull(),
});

describe('scoped table constraint', () => {
  it('accepts only tables created by tenantOwned', () => {
    const owned: TenantOwnedTable = widgets;
    expect(owned.oemId).toBeDefined();

    // @ts-expect-error a platform table is not tenant-owned
    const fromPlatform: TenantOwnedTable = platforms;
    void fromPlatform;

    // @ts-expect-error an oem_id column is not enough without the brand
    const fromLookalike: TenantOwnedTable = lookalike;
    void fromLookalike;
  });

  it('does not accept a raw object as TenantContext', () => {
    // @ts-expect-error TenantContext is branded and not structurally constructible
    const forged: TenantContext = { oemId: 'oem-a' };
    void forged;
  });

  it('rejects from() on a table that is not tenant-owned', () => {
    const _typeCheck = () => {
      const ctx = tenantContextFromPrincipal(
        principalFromVerifiedCredentials('oem-a'),
      );
      const db = null as unknown as Database;
      scoped(ctx, db).from(widgets);
      // @ts-expect-error platform tables cannot be queried through scoped
      scoped(ctx, db).from(platforms);
    };
    void _typeCheck;
    expect(_typeCheck).toBeTypeOf('function');
  });
});
