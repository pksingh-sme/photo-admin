/**
 * Machine-readable reason codes. SCREAMING_SNAKE, stable, and used as the
 * translation key (`FR-CNT-019`, `FR-API-005`). Storefront codes are additive
 * only.
 */
export const ErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode] | string;

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export function assertErrorCode(code: string): string {
  if (!ERROR_CODE_PATTERN.test(code)) {
    throw new Error(
      `error code must be SCREAMING_SNAKE (usable as a translation key), got ${JSON.stringify(code)}`,
    );
  }
  return code;
}

export function resourceToErrorCode(resource: string): string {
  const normalized = resource
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized === '' ? 'RESOURCE' : normalized;
}
