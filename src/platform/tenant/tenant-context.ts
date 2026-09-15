/**
 * Tenant identity. The OEM is derived from a verified principal, never from
 * a request field. (`FR-API-003`, `BR-ARCH-003`)
 *
 * Brands are unique symbols that are not exported, so the only legal
 * constructors are the functions in this file. A value assertion (`as`) can
 * still forge one; that is a review defect, not an API.
 */

declare const oemIdBrand: unique symbol;
export type OemId = string & { readonly [oemIdBrand]: 'OemId' };

declare const principalBrand: unique symbol;
export type AuthenticatedPrincipal = {
  readonly [principalBrand]: 'AuthenticatedPrincipal';
  readonly oemId: OemId;
};

declare const tenantContextBrand: unique symbol;
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
