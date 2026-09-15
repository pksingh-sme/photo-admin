import {
  index,
  mysqlTable,
  varchar,
  type AnyMySqlColumn,
  type MySqlColumnBuilderBase,
  type MySqlTable,
} from 'drizzle-orm/mysql-core';

const OEM_ID_LENGTH = 36;

const tenantOwnedTableNames = new Set<string>();

export function isTenantOwnedTableName(name: string): boolean {
  return tenantOwnedTableNames.has(name);
}

declare const tenantOwnedBrand: unique symbol;

/**
 * Only tables created by {@link tenantOwned} satisfy this type.
 * A `mysqlTable` that happens to have an `oem_id` column does not.
 */
export type TenantOwnedTable = MySqlTable & {
  readonly oemId: AnyMySqlColumn;
  readonly [tenantOwnedBrand]: true;
};

type TenantOwnedColumns = Record<string, MySqlColumnBuilderBase> & {
  id: MySqlColumnBuilderBase;
};

/**
 * Tenant-owned table helper. (`FR-TEN-001`)
 *
 * Adds a non-nullable `oem_id` and a primary access index led by `oem_id`.
 * Callers must supply an `id` column; do not mark it as the table primary key
 * if you also need a different clustered key — this index is the access path
 * for every tenant-scoped lookup.
 */
export function tenantOwned<
  TTableName extends string,
  TColumns extends TenantOwnedColumns,
>(name: TTableName, columns: TColumns) {
  tenantOwnedTableNames.add(name);

  const table = mysqlTable(
    name,
    {
      oemId: varchar('oem_id', { length: OEM_ID_LENGTH }).notNull(),
      ...columns,
    },
    (table) => [index(`${name}_oem_id_id`).on(table.oemId, table.id)],
  );

  return table as typeof table & { readonly [tenantOwnedBrand]: true };
}
