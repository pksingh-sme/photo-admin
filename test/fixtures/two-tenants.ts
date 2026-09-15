import {
  principalFromVerifiedCredentials,
  tenantContextFromPrincipal,
  type TenantContext,
} from '../../src/platform/tenant/tenant-context.js';

export type TwoTenants = {
  readonly a: TenantContext;
  readonly b: TenantContext;
};

/**
 * Default fixture for every test. Two tenants exist so a cross-tenant mistake
 * fails immediately rather than only in `test/tenancy/` (`050-testing.mdc`).
 */
export function createTwoTenants(): TwoTenants {
  return {
    a: tenantContextFromPrincipal(
      principalFromVerifiedCredentials('11111111-1111-4111-8111-111111111111'),
    ),
    b: tenantContextFromPrincipal(
      principalFromVerifiedCredentials('22222222-2222-4222-8222-222222222222'),
    ),
  };
}
