import type { TenantContext } from './tenant-context.js';

/**
 * HTTP-request binding for the credential-derived tenant. Observability and
 * `@Tenant()` read this; repositories still take `TenantContext` as a
 * parameter and never from ambient storage. (`FR-API-003`, `FR-TEN-009`)
 *
 * The OEM is never taken from a header, query, path or body — only from a
 * `TenantContext` created after credentials were verified.
 */
const tenants = new WeakMap<object, TenantContext>();

export function bindTenantContext(request: object, ctx: TenantContext): void {
  tenants.set(request, ctx);
}

export function boundTenantContext(
  request: unknown,
): TenantContext | undefined {
  if (typeof request !== 'object' || request === null) {
    return undefined;
  }
  return tenants.get(request);
}
