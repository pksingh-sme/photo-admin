import {
  context,
  propagation,
  trace,
  type Context,
  type Span,
} from '@opentelemetry/api';
import { OEM_BAGGAGE_KEY, OEM_ID_ATTRIBUTE } from './attributes.js';

/**
 * Puts `oem.id` in baggage (and on the active span when one exists).
 *
 * Incoming W3C baggage is overwritten: the OEM is derived from the
 * credential, never from the request. (`FR-API-003`, `FR-TEN-009`)
 */
export function contextWithOemId(
  oemId: string,
  parent = context.active(),
): Context {
  const existing =
    propagation.getBaggage(parent) ?? propagation.createBaggage();
  const baggage = existing.setEntry(OEM_BAGGAGE_KEY, { value: oemId });
  const withBaggage = propagation.setBaggage(parent, baggage);
  const span = trace.getSpan(withBaggage);
  if (span !== undefined) {
    applyOemToSpan(span, oemId);
  }
  return withBaggage;
}

export function contextWithoutIncomingOem(parent = context.active()): Context {
  const existing = propagation.getBaggage(parent);
  if (
    existing === undefined ||
    existing.getEntry(OEM_BAGGAGE_KEY) === undefined
  ) {
    return parent;
  }
  return propagation.setBaggage(parent, existing.removeEntry(OEM_BAGGAGE_KEY));
}

export function applyOemToSpan(span: Span, oemId: string): void {
  span.setAttribute(OEM_ID_ATTRIBUTE, oemId);
}

export function getOemIdFromContext(ctx?: Context): string | undefined {
  const active = ctx ?? context.active();
  const value = propagation
    .getBaggage(active)
    ?.getEntry(OEM_BAGGAGE_KEY)?.value;
  return value === undefined || value === '' ? undefined : value;
}
