import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  logProcessorsFromEnv,
  metricReadersFromEnv,
  traceProcessorsFromEnv,
} from './exporters.js';
import { OemBaggageLogProcessor } from './oem-log-processor.js';
import { OemBaggageSpanProcessor } from './oem-span-processor.js';

export type TelemetryHandle = {
  shutdown: () => Promise<void>;
};

const DEFAULT_SERVICE_NAME = 'photoprint-platform';

let running: NodeSDK | undefined;

/**
 * Starts traces, metrics and logs. Exporters, endpoint, protocol and headers
 * come from `OTEL_*` environment variables so the backend can change without
 * a code change. (`FR-TEN-009`)
 *
 * `OTEL_SDK_DISABLED=true` is a no-op (tests, local runs without a collector).
 */
export function startTelemetry(): TelemetryHandle {
  if (running !== undefined) {
    return { shutdown: shutdownTelemetry };
  }
  if (process.env['OTEL_SDK_DISABLED'] === 'true') {
    return { shutdown: shutdownTelemetry };
  }

  const sdk = new NodeSDK({
    serviceName: process.env['OTEL_SERVICE_NAME'] ?? DEFAULT_SERVICE_NAME,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
    spanProcessors: [
      new OemBaggageSpanProcessor(),
      ...traceProcessorsFromEnv(),
    ],
    metricReaders: metricReadersFromEnv(),
    logRecordProcessors: [
      new OemBaggageLogProcessor(),
      ...logProcessorsFromEnv(),
    ],
  });
  sdk.start();
  running = sdk;
  return { shutdown: shutdownTelemetry };
}

export async function shutdownTelemetry(): Promise<void> {
  const sdk = running;
  running = undefined;
  if (sdk === undefined) {
    return;
  }
  await sdk.shutdown();
}
