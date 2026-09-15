import './platform/telemetry/register.js';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { shutdownTelemetry } from './platform/telemetry/sdk.js';
import { TelemetryLogger } from './platform/telemetry/telemetry.logger.js';

const DEFAULT_PORT = 3000;

function listenPort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PORT;
  }

  return parsed;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { logger: new TelemetryLogger() },
  );
  app.enableShutdownHooks();

  await app.listen(listenPort(), '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function shutdown(): Promise<void> {
  await shutdownTelemetry();
}

process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
