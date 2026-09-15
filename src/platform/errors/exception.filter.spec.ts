import { Body, Controller, Get, HttpStatus, Logger, Post } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { zodPipe } from '../http/zod-pipe.js';
import { ForbiddenError, NotFoundError } from './domain-error.js';
import { ErrorCode } from './error-codes.js';
import { ErrorsModule } from './errors.module.js';
import { REQUEST_ID_HEADER, REQUEST_ID_PATTERN } from './request-id.js';
import { GENERIC_INTERNAL_MESSAGE } from './unsafe-message.js';

const echoBodySchema = z.looseObject({});

@Controller()
class ErrorProbeController {
  @Get('probe/not-found')
  notFound(): never {
    throw new NotFoundError('oem', 'oem-a');
  }

  @Get('probe/forbidden')
  forbidden(): never {
    throw new ForbiddenError();
  }

  @Get('probe/unexpected')
  unexpected(): never {
    throw new Error(
      'ER_BAD_FIELD_ERROR: SELECT * FROM secrets WHERE oem_id=?\n    at Query.run (mysql2/promise.js:1:1)',
    );
  }

  @Post('probe/echo')
  echo(
    @Body(zodPipe(echoBodySchema)) body: z.infer<typeof echoBodySchema>,
  ): z.infer<typeof echoBodySchema> {
    return body;
  }
}

function readJsonObject(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('error body must be an object');
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    result[key] = value;
  }
  return result;
}

describe('DomainExceptionFilter', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ErrorsModule],
      controllers: [ErrorProbeController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: 64 }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns { code, message, requestId } for NotFoundError as 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/probe/not-found',
    });
    const body = readJsonObject(response.body);
    const requestId = body['requestId'];

    expect(response.statusCode).toBe(404);
    expect(body).toEqual({
      code: 'OEM_NOT_FOUND',
      message: 'The oem "oem-a" was not found.',
      requestId,
    });
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'requestId']);
    expect(requestId).toMatch(REQUEST_ID_PATTERN);
    expect(response.headers[REQUEST_ID_HEADER]).toBe(requestId);
  });

  it('returns ForbiddenError as 403, not as a stand-in for out-of-scope access', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/probe/forbidden',
    });
    const body = readJsonObject(response.body);

    expect(response.statusCode).toBe(403);
    expect(body['code']).toBe(ErrorCode.FORBIDDEN);
    expect(response.headers[REQUEST_ID_HEADER]).toBe(body['requestId']);
  });

  it('does not put stack traces, SQL, or driver messages in the body', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error');
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/probe/unexpected',
      });
      const body = readJsonObject(response.body);
      const serialized = JSON.stringify(body);

      expect(response.statusCode).toBe(500);
      expect(body).toEqual({
        code: ErrorCode.INTERNAL_ERROR,
        message: GENERIC_INTERNAL_MESSAGE,
        requestId: body['requestId'],
      });
      expect(serialized).not.toMatch(/SELECT/i);
      expect(serialized).not.toMatch(/mysql/i);
      expect(serialized).not.toMatch(/ER_BAD_FIELD/);
      expect(serialized).not.toContain('at Query.run');
      expect(serialized).not.toContain('stack');
      expect(response.headers[REQUEST_ID_HEADER]).toBe(body['requestId']);

      expect(errorSpy).toHaveBeenCalled();
      const logged = errorSpy.mock.calls[0]?.[0];
      expect(String(logged)).toContain(
        `requestId=${String(body['requestId'])}`,
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('returns the standard envelope for malformed JSON, not Fastify\'s default', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/probe/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"not": json',
    });
    const body = readJsonObject(response.body);

    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'requestId']);
    expect(body).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: body['message'],
      requestId: body['requestId'],
    });
    expect(typeof body['message']).toBe('string');
    expect(body['message']).not.toBe('');
    expect(body['code']).not.toMatch(/^FST_/);
    expect(body).not.toHaveProperty('statusCode');
    expect(body).not.toHaveProperty('error');
    expect(JSON.stringify(body)).not.toMatch(/FST_ERR_/);
    expect(body['requestId']).toMatch(REQUEST_ID_PATTERN);
    expect(response.headers[REQUEST_ID_HEADER]).toBe(body['requestId']);
  });

  it('returns the standard envelope when the payload is too large', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/probe/echo',
      headers: { 'content-type': 'application/json' },
      payload: `{"x":"${'a'.repeat(200)}"}`,
    });
    const body = readJsonObject(response.body);

    expect(response.statusCode).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'requestId']);
    expect(body['code']).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body).not.toHaveProperty('statusCode');
    expect(JSON.stringify(body)).not.toMatch(/FST_ERR_/);
  });

  it('returns the standard envelope for an unsupported media type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/probe/echo',
      headers: { 'content-type': 'application/xml' },
      payload: '<probe/>',
    });
    const body = readJsonObject(response.body);

    expect(response.statusCode).toBe(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'requestId']);
    expect(body['code']).toBe(ErrorCode.VALIDATION_ERROR);
    expect(body).not.toHaveProperty('statusCode');
    expect(JSON.stringify(body)).not.toMatch(/FST_ERR_/);
  });
});
