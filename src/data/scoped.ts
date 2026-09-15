import { and, eq, type SQL } from 'drizzle-orm';
import type { MySqlUpdateSetSource } from 'drizzle-orm/mysql-core';
import type { Database } from './internal/client.js';
import type { TenantOwnedTable } from './schema/tenant-owned.js';
import type {
  OemId,
  TenantContext,
} from '../platform/tenant/tenant-context.js';

export type { Database };

/**
 * The only API for tenant-owned tables. (`FR-TEN-001`, `FR-TEN-002`)
 *
 * Drizzle's `.where()` is single-use: a second call is a type error, and under
 * `$dynamic()` it *replaces* the clause. Returning a raw builder after
 * `where(oem_id)` would therefore either block further filters or drop the
 * tenant predicate. Every verb below applies `oem_id = ctx.oemId` itself and
 * ANDs any extra predicate the caller supplies.
 *
 * `db` is produced by `src/data/internal/client.ts`. Repositories take it
 * through `TenantRepository`; they never import the client.
 */
export function scoped(ctx: TenantContext, db: Database) {
  return {
    from: <T extends TenantOwnedTable>(table: T) =>
      scopedSelect(db, table, ctx),
    insert: <T extends TenantOwnedTable>(table: T) =>
      scopedInsert(db, table, ctx),
    update: <T extends TenantOwnedTable>(table: T) =>
      scopedUpdate(db, table, ctx),
    delete: <T extends TenantOwnedTable>(table: T) =>
      scopedDelete(db, table, ctx),
  };
}

type InsertValues<T extends TenantOwnedTable> = Omit<
  T['$inferInsert'],
  'oemId'
>;
type UpdateValues<T extends TenantOwnedTable> = Omit<
  Partial<T['$inferInsert']>,
  'oemId'
>;

function tenantPredicate<T extends TenantOwnedTable>(
  table: T,
  ctx: TenantContext,
): SQL {
  return eq(table.oemId, ctx.oemId);
}

function withTenantScope(scope: SQL, extra: SQL | undefined): SQL {
  if (extra === undefined) {
    return scope;
  }

  const combined = and(scope, extra);
  return combined ?? scope;
}

function overwriteOemId<T extends object>(
  row: T,
  oemId: OemId,
): Omit<T, 'oemId'> & { oemId: OemId } {
  const { oemId: _discarded, ...rest } = row as T & { oemId?: unknown };
  void _discarded;
  return { ...rest, oemId };
}

function scopedSelect<T extends TenantOwnedTable>(
  db: Database,
  table: T,
  ctx: TenantContext,
) {
  const scope = tenantPredicate(table, ctx);

  return {
    where(extra?: SQL) {
      return db.select().from(table).where(withTenantScope(scope, extra));
    },
  };
}

function scopedInsert<T extends TenantOwnedTable>(
  db: Database,
  table: T,
  ctx: TenantContext,
) {
  return {
    values(values: InsertValues<T> | InsertValues<T>[]) {
      // Bound after context overwrite. The assertion is the point at which
      // caller-supplied oemId has been discarded. (`FR-TEN-001`)
      if (Array.isArray(values)) {
        return db
          .insert(table)
          .values(
            values.map((row) =>
              overwriteOemId(row, ctx.oemId),
            ) as T['$inferInsert'][],
          );
      }

      return db
        .insert(table)
        .values(overwriteOemId(values, ctx.oemId) as T['$inferInsert']);
    },
  };
}

function scopedUpdate<T extends TenantOwnedTable>(
  db: Database,
  table: T,
  ctx: TenantContext,
) {
  const scope = tenantPredicate(table, ctx);

  return {
    set(values: UpdateValues<T>) {
      const { oemId: _immutable, ...set } = values as UpdateValues<T> & {
        oemId?: unknown;
      };
      void _immutable;

      return {
        where(extra?: SQL) {
          return db
            .update(table)
            .set(set as unknown as MySqlUpdateSetSource<T>)
            .where(withTenantScope(scope, extra));
        },
      };
    },
  };
}

function scopedDelete<T extends TenantOwnedTable>(
  db: Database,
  table: T,
  ctx: TenantContext,
) {
  const scope = tenantPredicate(table, ctx);

  return {
    where(extra?: SQL) {
      return db.delete(table).where(withTenantScope(scope, extra));
    },
  };
}
