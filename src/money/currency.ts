/**
 * ISO 4217 alphabetic code. Which codes an OEM may activate is PFX data;
 * this module only names the code shape.
 */
export type Currency = string;

const ISO_4217_ALPHA = /^[A-Z]{3}$/;

export function assertIso4217Code(code: string): void {
  if (!ISO_4217_ALPHA.test(code)) {
    throw new Error(
      `currency must be an ISO 4217 alphabetic code, got ${JSON.stringify(code)}`,
    );
  }
}
