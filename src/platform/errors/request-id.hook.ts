import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  REQUEST_ID_HEADER,
  createRequestId,
  enterRequestId,
} from './request-id.js';

declare module 'fastify' {
  interface FastifyRequest {
    requestId?: string;
  }
}

@Injectable()
export class RequestIdHook implements OnApplicationBootstrap {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  onApplicationBootstrap(): void {
    const instance: unknown = this.adapterHost.httpAdapter.getInstance();
    if (!isFastifyInstance(instance)) {
      throw new Error('RequestIdHook requires the Fastify adapter');
    }

    instance.addHook(
      'onRequest',
      (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
        const requestId = createRequestId();
        request.requestId = requestId;
        void reply.header(REQUEST_ID_HEADER, requestId);
        enterRequestId(requestId);
        done();
      },
    );
  }
}

function isFastifyInstance(value: unknown): value is FastifyInstance {
  if (typeof value !== 'object' || value === null || !('addHook' in value)) {
    return false;
  }
  return typeof value.addHook === 'function';
}
