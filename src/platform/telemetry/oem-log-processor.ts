import type { Context } from '@opentelemetry/api';
import type {
  LogRecordProcessor,
  ReadWriteLogRecord,
} from '@opentelemetry/sdk-logs';
import { OEM_ID_ATTRIBUTE } from './attributes.js';
import { getOemIdFromContext } from './oem-context.js';

/**
 * Stamps OTLP log records with `oem.id` from baggage. (`FR-TEN-009`)
 */
export class OemBaggageLogProcessor implements LogRecordProcessor {
  onEmit(logRecord: ReadWriteLogRecord, ctx?: Context): void {
    const oemId = getOemIdFromContext(ctx);
    if (oemId === undefined) {
      return;
    }
    logRecord.setAttribute(OEM_ID_ATTRIBUTE, oemId);
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
