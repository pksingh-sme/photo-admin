import {
  index,
  mysqlTable,
  varchar,
  type MySqlColumnBuilderBase,
} from 'drizzle-orm/mysql-core';

const OEM_ID_LENGTH = 36;

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
  return mysqlTable(
    name,
    {
      oemId: varchar('oem_id', { length: OEM_ID_LENGTH }).notNull(),
      ...columns,
    },
    (table) => [index(`${name}_oem_id_id`).on(table.oemId, table.id)],
  );
}
