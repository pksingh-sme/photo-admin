import {
  Controller,
  Get,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { context } from '@opentelemetry/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTwoTenants } from '../../../test/fixtures/two-tenants.js';
import { bindTenantContext } from '../tenant/request-tenant.js';
import { OEM_ID_ATTRIBUTE } from './attributes.js';
import { contextWithOemId, getOemIdFromContext } from './oem-context.js';
import { startInMemoryTracer } from './in-memory-tracer.js';
import { TelemetryModule } from './telemetry.module.js';

@Controller()
class OemProbeController {
  @Get('telemetry/oem')
  ping(): { ok: true } {
    return { ok: true };
  }
}

describe('OEM telemetry (FR-TEN-009)', () => {
  const tenants = createTwoTenants();
  const tracer = startInMemoryTracer();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const bindOemFromCredentials: CanActivate = {
      canActivate(execution: ExecutionContext): boolean {
        bindTenantContext(
          execution.switchToHttp().getRequest<object>(),
          tenants.a,
        );
        return true;
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [TelemetryModule],
      controllers: [OemProbeController],
      providers: [{ provide: APP_GUARD, useValue: bindOemFromCredentials }],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await tracer.shutdown();
  });

  it('puts oem.id in baggage from the credential, not from the request', () => {
    context.with(contextWithOemId(tenants.a.oemId), () => {
      expect(getOemIdFromContext()).toBe(tenants.a.oemId);
    });
  });

  it('produces a span carrying the OEM id for a request in an OEM context', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/telemetry/oem',
      headers: { 'x-oem-id': tenants.b.oemId },
    });
    expect(response.statusCode).toBe(200);

    await tracer.forceFlush();
    const spans = tracer.exporter.getFinishedSpans();
    const oemIds = spans.map((span) => span.attributes[OEM_ID_ATTRIBUTE]);

    expect(oemIds).toContain(tenants.a.oemId);
    expect(oemIds).not.toContain(tenants.b.oemId);
  });
});
