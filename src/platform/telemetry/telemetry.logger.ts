import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { getRequestId } from '../errors/request-id.js';
import { OEM_ID_ATTRIBUTE, TELEMETRY_TRACER_NAME } from './attributes.js';
import { getOemIdFromContext } from './oem-context.js';

const otelLogger = logs.getLogger(TELEMETRY_TRACER_NAME);

/**
 * Correlation logger: request id (`FR-API-005`) and OEM id (`FR-TEN-009`)
 * on every Nest log line, and a matching OTLP log record.
 */
export class TelemetryLogger extends ConsoleLogger {
  protected override formatContext(context: string): string {
    const requestId = getRequestId();
    const oemId = getOemIdFromContext();
    const parts = [context];
    if (requestId !== undefined) {
      parts.push(`requestId=${requestId}`);
    }
    if (oemId !== undefined) {
      parts.push(`oemId=${oemId}`);
    }
    return super.formatContext(parts.join(' '));
  }

  protected override printMessages(
    messages: unknown[],
    ctx?: string,
    logLevel: LogLevel = 'log',
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    super.printMessages(messages, ctx, logLevel, writeStreamType, errorStack);
    emitOtelLog(logLevel, messages);
  }
}

function emitOtelLog(level: LogLevel, messages: unknown[]): void {
  const oemId = getOemIdFromContext();
  const requestId = getRequestId();
  const attributes: Record<string, string> = {};
  if (oemId !== undefined) {
    attributes[OEM_ID_ATTRIBUTE] = oemId;
  }
  if (requestId !== undefined) {
    attributes['request.id'] = requestId;
  }
  otelLogger.emit({
    severityNumber: severity(level),
    severityText: level.toUpperCase(),
    body: messages.map(stringifyLog).join(' '),
    attributes,
  });
}

function severity(level: LogLevel): SeverityNumber {
  switch (level) {
    case 'verbose':
    case 'debug':
      return SeverityNumber.DEBUG;
    case 'warn':
      return SeverityNumber.WARN;
    case 'error':
    case 'fatal':
      return SeverityNumber.ERROR;
    default:
      return SeverityNumber.INFO;
  }
}

function stringifyLog(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return '[unserializable]';
  }
}
