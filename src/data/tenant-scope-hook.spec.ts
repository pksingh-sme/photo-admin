import { eq } from 'drizzle-orm';
import { varchar } from 'drizzle-orm/mysql-core';
import type { Pool } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { tenantOwned } from './schema/tenant-owned.js';
import { UnscopedTenantQueryError } from './tenant-scope-hook.js';

const probe = tenantOwned('unscoped_probe', {
  id: varchar('id', { length: 36 }).notNull(),
});

function unreachablePool(): Pool {
  return {
    query: () => {
      throw new Error('unscoped query must not reach MySQL');
    },
  } as unknown as Pool;
}

describe('tenant-scope query hook', () => {
  it('throws when a raw client query hits a tenant-owned table without oem_id in WHERE', async () => {
    const db = createDb(unreachablePool());

    try {
      await db.select().from(probe).where(eq(probe.id, 'row-1'));
      expect.unreachable('unscoped query must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(UnscopedTenantQueryError);
      if (!(error instanceof UnscopedTenantQueryError)) {
        return;
      }

      expect(error.message).toContain('oem_id predicate');
      expect(error.message).toContain('unscoped_probe');
      expect(error.message).toMatch(/select/i);
    }
  });
});
