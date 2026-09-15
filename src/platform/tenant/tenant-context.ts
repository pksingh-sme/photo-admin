/**
 * Tenant identity. The OEM is derived from a verified principal, never from
 * a request field. (`FR-API-003`, `BR-ARCH-003`)
 *
 * Brands are unique symbols that are not exported, so the only legal
 * constructors are the functions in this file. `as TenantContext` is rejected
 * by ESLint (`no-restricted-syntax`). Structural assignment is a type error
 * (`@ts-expect-error` in `src/data/scoped.spec.ts`).
 */

declare const oemIdBrand: unique symbol;
export type OemId = string & { readonly [oemIdBrand]: 'OemId' };

const principalBrand: unique symbol = Symbol('AuthenticatedPrincipal');
export type AuthenticatedPrincipal = {
  readonly [principalBrand]: 'AuthenticatedPrincipal';
  readonly oemId: OemId;
};

const tenantContextBrand: unique symbol = Symbol('TenantContext');
export type TenantContext = {
  readonly [tenantContextBrand]: 'TenantContext';
  readonly oemId: OemId;
};

/**
 * Trust boundary: call only after credentials have been verified.
 * This is not a general-purpose constructor for feature code.
 */
export function principalFromVerifiedCredentials(
  oemId: string,
): AuthenticatedPrincipal {
  return {
    [principalBrand]: 'AuthenticatedPrincipal',
    oemId: oemId as OemId,
  };
}

export function tenantContextFromPrincipal(
  principal: AuthenticatedPrincipal,
): TenantContext {
  return {
    [tenantContextBrand]: 'TenantContext',
    oemId: principal.oemId,
  };
}
