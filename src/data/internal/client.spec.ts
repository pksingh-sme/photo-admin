import { eq, isNotNull } from 'drizzle-orm';
import { varchar } from 'drizzle-orm/mysql-core';
import type { Pool } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { tenantOwned } from '../schema/tenant-owned.js';
import { UnscopedTenantQueryError } from '../tenant-scope-hook.js';
import { runWithCallerOem } from '../../platform/tenant/caller-oem.js';
import { createDb } from './client.js';

const probe = tenantOwned('internal_client_probe', {
  id: varchar('id', { length: 36 }).notNull(),
});

const CALLER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function unreachablePool(): Pool {
  return {
    query: () => {
      throw new Error('unscoped query must not reach MySQL');
    },
  } as unknown as Pool;
}

describe('internal client attaches the tenant-scope hook', () => {
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
      expect(error.message).toContain('internal_client_probe');
      expect(error.message).toMatch(/select/i);
    }
  });

  it('rejects drizzle isNotNull(oemId) and accepts eq bound to the caller OEM', async () => {
    const db = createDb(unreachablePool());
    await expect(
      db.select().from(probe).where(isNotNull(probe.oemId)),
    ).rejects.toBeInstanceOf(UnscopedTenantQueryError);

    await runWithCallerOem(CALLER, async () => {
      await expect(
        db.select().from(probe).where(eq(probe.oemId, CALLER)),
      ).rejects.toThrow(/Failed query|must not reach MySQL/);
    });
  });

  it('rejects INSERT bound to another OEM and allows the caller OEM', async () => {
    const db = createDb(unreachablePool());
    await expect(
      db.insert(probe).values({ id: 'row-1', oemId: OTHER }),
    ).rejects.toBeInstanceOf(UnscopedTenantQueryError);

    await runWithCallerOem(CALLER, async () => {
      await expect(
        db.insert(probe).values({ id: 'row-1', oemId: CALLER }),
      ).rejects.toThrow(/Failed query|must not reach MySQL/);
    });
  });
});
