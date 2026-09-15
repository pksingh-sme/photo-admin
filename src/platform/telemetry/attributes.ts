/**
 * Per-request OEM identity on traces, metrics and logs. (`FR-TEN-009`)
 *
 * This is a span/baggage/log attribute, not a Resource attribute: a Resource
 * is process-wide and cannot carry a tenant in a multi-tenant service.
 */
export const OEM_ID_ATTRIBUTE = 'oem.id';

/** W3C baggage key. Written from the credential, never trusted as the tenant source. */
export const OEM_BAGGAGE_KEY = 'oem.id';

export const TELEMETRY_TRACER_NAME = 'photoprint-platform';
