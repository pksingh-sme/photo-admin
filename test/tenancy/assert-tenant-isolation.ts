import { describe, expect, it } from 'vitest';
import type { TenantContext } from '../../src/platform/tenant/tenant-context.js';

export type IsolationRecord = {
  readonly id: string;
  readonly oemId: string;
};

export type IsolationLookup<T> =
  | { outcome: 'ok'; record: T }
  | { outcome: 'not-found' }
  | { outcome: 'forbidden' };

export type TenantIsolationFactory<
  T extends IsolationRecord = IsolationRecord,
> = {
  create(ctx: TenantContext, input?: { oemId?: string }): Promise<T>;
  read(ctx: TenantContext, id: string): Promise<IsolationLookup<T>>;
  update(
    ctx: TenantContext,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<IsolationLookup<T>>;
  delete(ctx: TenantContext, id: string): Promise<IsolationLookup<void>>;
  list(ctx: TenantContext): Promise<T[]>;
};

/**
 * Parameterised tenancy suite. (`FR-TEN-010`)
 *
 * `entityName` must be the table name passed to `tenantOwned()`.
 * `test/tenancy/registry.test.ts` fails the build if a tenant-owned table
 * has no matching call. Out-of-scope access must be **not-found** (404),
 * never **forbidden** (403). (`FR-TEN-003`)
 */
export function assertTenantIsolation<T extends IsolationRecord>(
  entityName: string,
  factory: TenantIsolationFactory<T>,
): void {
  describe(`FR-TEN-010 ${entityName} tenant isolation`, () => {
    it(`Tenant B reads Tenant A's ${entityName} by id → 404`, async ({
      tenants,
    }) => {
      const created = await factory.create(tenants.a);
      const result = await factory.read(tenants.b, created.id);
      expectNotFound(result, `read ${entityName}`);
    });

    it(`Tenant B updates Tenant A's ${entityName} → 404`, async ({
      tenants,
    }) => {
      const created = await factory.create(tenants.a);
      const result = await factory.update(tenants.b, created.id, {});
      expectNotFound(result, `update ${entityName}`);
    });

    it(`Tenant B deletes Tenant A's ${entityName} → 404`, async ({
      tenants,
    }) => {
      const created = await factory.create(tenants.a);
      const result = await factory.delete(tenants.b, created.id);
      expectNotFound(result, `delete ${entityName}`);
    });

    it(`Tenant B lists ${entityName} → Tenant A's record is absent`, async ({
      tenants,
    }) => {
      const created = await factory.create(tenants.a);
      const listed = await factory.list(tenants.b);
      expect(listed.map((row) => row.id)).not.toContain(created.id);
    });

    it(`create ${entityName} with a forged oemId ignores the forged value`, async ({
      tenants,
    }) => {
      const created = await factory.create(tenants.a, {
        oemId: tenants.b.oemId,
      });
      expect(created.oemId).toBe(tenants.a.oemId);
    });
  });
}

function expectNotFound(
  result: IsolationLookup<unknown>,
  action: string,
): void {
  if (result.outcome === 'forbidden') {
    expect.fail(
      `${action} returned 403; out-of-scope must be 404 (FR-TEN-003)`,
    );
  }
  expect(result.outcome).toBe('not-found');
}
