import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { describe, expect, it } from 'vitest';
import {
  assertNoUnregisteredOemIdTables,
  assertSchemaHasNoUnregisteredOemIdTables,
  UnregisteredOemIdTableError,
  unregisteredOemIdTableNamesFromSource,
} from './assert-registered.js';
import { isTenantOwnedTableName, tenantOwned } from './schema/tenant-owned.js';
import {
  assertTenantOwnedQueryIsScoped,
  UnscopedTenantQueryError,
} from './tenant-scope-hook.js';
import { runWithCallerOem } from '../platform/tenant/caller-oem.js';

const probe = tenantOwned('unscoped_probe', {
  id: varchar('id', { length: 36 }).notNull(),
});

const CALLER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/** Pre-R3 hook: VALUES inserts skipped; any WHERE mentioning oem_id passed. */
function previousMentionHookWouldAccept(sql: string): boolean {
  const tableRef = /\b(?:from|join|update|into)\s+`([^`]+)`/gi;
  let targets = false;
  for (const match of sql.matchAll(tableRef)) {
    const name = match[1];
    if (name !== undefined && isTenantOwnedTableName(name)) {
      targets = true;
      break;
    }
  }
  if (!targets) {
    return true;
  }

  const trimmed = sql.trimStart();
  if (/^insert\b/i.test(trimmed) && !/\bselect\b/i.test(trimmed)) {
    return true;
  }

  const whereAt = sql.search(/\bwhere\b/i);
  if (whereAt === -1) {
    return false;
  }
  const afterWhere = sql.slice(whereAt + 'where'.length);
  const endAt = afterWhere.search(
    /\b(?:order\s+by|group\s+by|limit|having|for\s+update|lock\s+in)\b/i,
  );
  const where = endAt === -1 ? afterWhere : afterWhere.slice(0, endAt);
  return /`oem_id`|\boem_id\b/i.test(where);
}

describe('tenant-scope query hook', () => {
  it('fails closed on oem_id tables that skipped tenantOwned (the query hook used to ignore them)', () => {
    const forgotten = mysqlTable('forgotten_orders', {
      oemId: varchar('oem_id', { length: 36 }).notNull(),
      id: varchar('id', { length: 36 }).notNull(),
    });

    const sql = 'select `id` from `forgotten_orders` where `id` = ?';
    expect(isTenantOwnedTableName('forgotten_orders')).toBe(false);
    expect(previousMentionHookWouldAccept(sql)).toBe(true);
    expect(() => assertTenantOwnedQueryIsScoped(sql, ['row-1'])).not.toThrow();

    expect(() => assertNoUnregisteredOemIdTables([forgotten])).toThrow(
      UnregisteredOemIdTableError,
    );
    expect(() => assertNoUnregisteredOemIdTables([forgotten])).toThrow(
      /forgotten_orders/,
    );

    const source = `
      export const forgotten = mysqlTable('forgotten_orders', {
        oemId: varchar('oem_id', { length: 36 }).notNull(),
        id: varchar('id', { length: 36 }).notNull(),
      });
    `;
    expect(unregisteredOemIdTableNamesFromSource(source)).toEqual([
      'forgotten_orders',
    ]);

    expect(() => assertNoUnregisteredOemIdTables([probe])).not.toThrow();
    expect(() => assertSchemaHasNoUnregisteredOemIdTables()).not.toThrow();
  });

  it('rejects WHERE oem_id IS NOT NULL, which previously passed as a mention', () => {
    const sql = 'select `id` from `unscoped_probe` where `oem_id` is not null';
    expect(previousMentionHookWouldAccept(sql)).toBe(true);
    expect(() => assertTenantOwnedQueryIsScoped(sql, [])).toThrow(
      UnscopedTenantQueryError,
    );
    expect(() => assertTenantOwnedQueryIsScoped(sql, [])).toThrow(
      /equality parameter/,
    );

    const eqSql =
      'select `id` from `unscoped_probe` where `unscoped_probe`.`oem_id` = ?';
    expect(() =>
      runWithCallerOem(OTHER, () =>
        assertTenantOwnedQueryIsScoped(eqSql, [OTHER]),
      ),
    ).not.toThrow();
    expect(() =>
      runWithCallerOem(CALLER, () =>
        assertTenantOwnedQueryIsScoped(eqSql, [OTHER]),
      ),
    ).toThrow(/caller OEM is/);
  });

  it('rejects INSERT without oem_id, which the VALUES exemption previously allowed', () => {
    const insertWithoutOem =
      'insert into `unscoped_probe` (`id`) values (?)';
    expect(previousMentionHookWouldAccept(insertWithoutOem)).toBe(true);
    expect(() =>
      assertTenantOwnedQueryIsScoped(insertWithoutOem, ['row-1']),
    ).toThrow(UnscopedTenantQueryError);
    expect(() =>
      assertTenantOwnedQueryIsScoped(insertWithoutOem, ['row-1']),
    ).toThrow(/INSERT must include oem_id/);

    const insertWrongOem =
      'insert into `unscoped_probe` (`id`, `oem_id`) values (?, ?)';
    expect(() =>
      runWithCallerOem(CALLER, () =>
        assertTenantOwnedQueryIsScoped(insertWrongOem, ['row-1', OTHER]),
      ),
    ).toThrow(/caller OEM is/);
    expect(() =>
      runWithCallerOem(CALLER, () =>
        assertTenantOwnedQueryIsScoped(insertWrongOem, ['row-1', CALLER]),
      ),
    ).not.toThrow();

    const updateMention =
      'update `unscoped_probe` set `id` = ? where `oem_id` is not null';
    expect(previousMentionHookWouldAccept(updateMention)).toBe(true);
    expect(() =>
      assertTenantOwnedQueryIsScoped(updateMention, ['row-2']),
    ).toThrow(/equality parameter/);

    const deleteMention =
      'delete from `unscoped_probe` where `oem_id` is not null';
    expect(previousMentionHookWouldAccept(deleteMention)).toBe(true);
    expect(() => assertTenantOwnedQueryIsScoped(deleteMention, [])).toThrow(
      /equality parameter/,
    );
  });
});
