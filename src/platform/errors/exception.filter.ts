import {
  Catch,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { mapException } from './map-exception.js';
import { toErrorResponse } from './error-response.js';
import {
  REQUEST_ID_HEADER,
  createRequestId,
  getRequestId,
  readRequestId,
} from './request-id.js';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request: unknown = ctx.getRequest();
    const response: unknown = ctx.getResponse();

    const requestId =
      readRequestId(request) ?? getRequestId() ?? createRequestId();
    const mapped = mapException(exception);

    if (mapped.logUnhandled) {
      if (mapped.stack === undefined) {
        this.logger.error(`Unhandled exception requestId=${requestId}`);
      } else {
        this.logger.error(
          `Unhandled exception requestId=${requestId}`,
          mapped.stack,
        );
      }
    }

    const body = toErrorResponse(mapped.code, mapped.message, requestId);
    httpAdapter.setHeader(response, REQUEST_ID_HEADER, requestId);
    httpAdapter.reply(response, body, mapped.status);
  }
}
