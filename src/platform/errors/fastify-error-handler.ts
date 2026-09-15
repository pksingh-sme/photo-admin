import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { toErrorResponse } from './error-response.js';
import { mapException } from './map-exception.js';
import {
  REQUEST_ID_HEADER,
  createRequestId,
  getRequestId,
  readRequestId,
} from './request-id.js';

const logger = new Logger('FastifyErrorHandler');

/**
 * Fastify parser failures (malformed JSON, payload too large, unsupported
 * media type) never enter Nest's exception filter. This handler is the
 * envelope for those. (`FR-API-005`)
 */
export function installFastifyErrorHandler(instance: FastifyInstance): void {
  instance.setErrorHandler(
    (
      error: FastifyError,
      request: FastifyRequest,
      reply: FastifyReply,
    ): void => {
      const requestId =
        readRequestId(request) ?? getRequestId() ?? createRequestId();
      const mapped = mapException(error);

      if (mapped.logUnhandled) {
        if (mapped.stack === undefined) {
          logger.error(`Unhandled exception requestId=${requestId}`);
        } else {
          logger.error(
            `Unhandled exception requestId=${requestId}`,
            mapped.stack,
          );
        }
      }

      void reply
        .header(REQUEST_ID_HEADER, requestId)
        .status(mapped.status)
        .send(toErrorResponse(mapped.code, mapped.message, requestId));
    },
  );
}

@Injectable()
export class FastifyErrorHandlerHook implements OnApplicationBootstrap {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  onApplicationBootstrap(): void {
    const instance: unknown = this.adapterHost.httpAdapter.getInstance();
    if (!isFastifyInstance(instance)) {
      throw new Error('FastifyErrorHandlerHook requires the Fastify adapter');
    }
    installFastifyErrorHandler(instance);
  }
}

function isFastifyInstance(value: unknown): value is FastifyInstance {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('setErrorHandler' in value)
  ) {
    return false;
  }
  return typeof value.setErrorHandler === 'function';
}
