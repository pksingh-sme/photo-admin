import { HttpException, HttpStatus } from '@nestjs/common';
import { DomainError } from './domain-error.js';
import { ErrorCode } from './error-codes.js';
import {
  GENERIC_INTERNAL_MESSAGE,
  clientSafeMessage,
  isUnsafeErrorMessage,
} from './unsafe-message.js';

export type MappedException = {
  status: number;
  code: string;
  message: string;
  logUnhandled: boolean;
  stack: string | undefined;
};

export function mapException(exception: unknown): MappedException {
  if (exception instanceof DomainError) {
    const unsafe = isUnsafeErrorMessage(exception.message);
    return {
      status: exception.httpStatus,
      code: unsafe ? ErrorCode.INTERNAL_ERROR : exception.code,
      message: clientSafeMessage(exception.message),
      logUnhandled: unsafe,
      stack: exception.stack,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const raw = nestHttpMessage(exception);
    const serverError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const unsafe = serverError || isUnsafeErrorMessage(raw);
    return {
      status,
      code: codeForStatus(status),
      message: unsafe ? GENERIC_INTERNAL_MESSAGE : raw,
      logUnhandled: serverError || unsafe,
      stack: exception.stack,
    };
  }

  if (isHttpStatusError(exception)) {
    const status = exception.statusCode;
    const serverError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception.message;
    const unsafe = serverError || isUnsafeErrorMessage(raw);
    return {
      status,
      code: codeForStatus(status),
      message: unsafe ? GENERIC_INTERNAL_MESSAGE : raw,
      logUnhandled: serverError || unsafe,
      stack: exception.stack,
    };
  }

  const stack = exception instanceof Error ? exception.stack : undefined;
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: GENERIC_INTERNAL_MESSAGE,
    logUnhandled: true,
    stack,
  };
}

function isHttpStatusError(
  exception: unknown,
): exception is Error & { statusCode: number } {
  if (!(exception instanceof Error) || !('statusCode' in exception)) {
    return false;
  }
  const status = exception.statusCode;
  if (typeof status !== 'number' || !Number.isInteger(status)) {
    return false;
  }
  return status >= 400 && status <= 599;
}

function nestHttpMessage(exception: HttpException): string {
  const payload: unknown = exception.getResponse();
  if (typeof payload === 'string' && payload !== '') {
    return payload;
  }
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = payload.message;
    if (typeof message === 'string' && message !== '') {
      return message;
    }
    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return message.join('; ');
    }
  }
  return exception.message;
}

function codeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCode.VALIDATION_ERROR;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND;
    default:
      return status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? ErrorCode.INTERNAL_ERROR
        : ErrorCode.VALIDATION_ERROR;
  }
}
