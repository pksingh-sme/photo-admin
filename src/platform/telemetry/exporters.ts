import { OTLPLogExporter as GrpcLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPLogExporter as HttpJsonLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPLogExporter as ProtoLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter as GrpcMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPMetricExporter as HttpJsonMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPMetricExporter as ProtoMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter as GrpcTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as HttpJsonTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter as ProtoTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  BatchLogRecordProcessor,
  type LogRecordExporter,
  type LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  PeriodicExportingMetricReader,
  type IMetricReader,
  type PushMetricExporter,
} from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';

type OtlpProtocol = 'grpc' | 'http/json' | 'http/protobuf';

/**
 * OTLP exporters are constructed with no endpoint/headers in code. The SDK
 * reads `OTEL_EXPORTER_OTLP_*` (and per-signal variants) so Grafana Cloud or
 * any other collector is a configuration change, not a deploy. (`FR-TEN-009`)
 */
export function traceProcessorsFromEnv(): SpanProcessor[] {
  return exportersFromEnv('OTEL_TRACES_EXPORTER').map(
    (name) => new BatchSpanProcessor(traceExporter(name)),
  );
}

export function metricReadersFromEnv(): IMetricReader[] {
  return exportersFromEnv('OTEL_METRICS_EXPORTER')
    .filter((name) => name === 'otlp')
    .map(
      () =>
        new PeriodicExportingMetricReader({
          exporter: metricExporter(otlpProtocol('METRICS')),
        }),
    );
}

export function logProcessorsFromEnv(): LogRecordProcessor[] {
  return exportersFromEnv('OTEL_LOGS_EXPORTER').map(
    () =>
      new BatchLogRecordProcessor({
        exporter: logExporter(otlpProtocol('LOGS')),
      }),
  );
}

function exportersFromEnv(variable: string): string[] {
  const raw = process.env[variable];
  const names = (raw === undefined || raw === '' ? 'otlp' : raw)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (names.includes('none')) {
    return [];
  }
  return names.filter((name) => name === 'otlp');
}

function otlpProtocol(signal: 'TRACES' | 'METRICS' | 'LOGS'): OtlpProtocol {
  const specific = process.env[`OTEL_EXPORTER_OTLP_${signal}_PROTOCOL`];
  const general = process.env['OTEL_EXPORTER_OTLP_PROTOCOL'];
  const raw = (specific ?? general ?? 'http/protobuf').trim();
  if (raw === 'grpc' || raw === 'http/json' || raw === 'http/protobuf') {
    return raw;
  }
  return 'http/protobuf';
}

function traceExporter(name: string): SpanExporter {
  if (name !== 'otlp') {
    return new ProtoTraceExporter();
  }
  switch (otlpProtocol('TRACES')) {
    case 'grpc':
      return new GrpcTraceExporter();
    case 'http/json':
      return new HttpJsonTraceExporter();
    case 'http/protobuf':
      return new ProtoTraceExporter();
  }
}

function metricExporter(protocol: OtlpProtocol): PushMetricExporter {
  switch (protocol) {
    case 'grpc':
      return new GrpcMetricExporter();
    case 'http/json':
      return new HttpJsonMetricExporter();
    case 'http/protobuf':
      return new ProtoMetricExporter();
  }
}

function logExporter(protocol: OtlpProtocol): LogRecordExporter {
  switch (protocol) {
    case 'grpc':
      return new GrpcLogExporter();
    case 'http/json':
      return new HttpJsonLogExporter();
    case 'http/protobuf':
      return new ProtoLogExporter();
  }
}
