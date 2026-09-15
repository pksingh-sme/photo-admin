import type { Context } from '@opentelemetry/api';
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OEM_ID_ATTRIBUTE } from './attributes.js';
import { getOemIdFromContext } from './oem-context.js';

/**
 * Copies credential-derived `oem.id` baggage onto every recording span so
 * child spans (HTTP, DB, Nest) carry OEM without each site setting it.
 * (`FR-TEN-009`)
 */
export class OemBaggageSpanProcessor implements SpanProcessor {
  onStart(span: Span, parentContext: Context): void {
    const oemId = getOemIdFromContext(parentContext);
    if (oemId === undefined) {
      return;
    }
    span.setAttribute(OEM_ID_ATTRIBUTE, oemId);
  }

  onEnd(span: ReadableSpan): void {
    void span;
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
