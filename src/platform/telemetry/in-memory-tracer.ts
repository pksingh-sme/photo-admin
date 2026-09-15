import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OemBaggageSpanProcessor } from './oem-span-processor.js';

export type InMemoryTracer = {
  exporter: InMemorySpanExporter;
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
};

/**
 * In-process tracer for tests. Does not export via OTLP.
 */
export function startInMemoryTracer(): InMemoryTracer {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [
      new OemBaggageSpanProcessor(),
      new SimpleSpanProcessor(exporter),
    ],
  });
  provider.register();
  return {
    exporter,
    forceFlush: () => provider.forceFlush(),
    shutdown: () => provider.shutdown(),
  };
}
