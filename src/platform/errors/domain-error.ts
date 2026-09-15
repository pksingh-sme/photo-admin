import { HttpStatus } from '@nestjs/common';
import {
  ErrorCode,
  assertErrorCode,
  resourceToErrorCode,
} from './error-codes.js';

export class DomainError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(args: { code: string; message: string; httpStatus: number }) {
    super(args.message);
    this.name = new.target.name;
    this.code = assertErrorCode(args.code);
    this.httpStatus = args.httpStatus;
  }
}

/**
 * A missing record — including a record that exists only in another OEM.
 *
 * Out-of-scope access must throw this error (HTTP 404), never
 * ForbiddenError. A 403 would confirm that the identifier exists in another
 * tenant, which discloses another OEM's data. (`FR-TEN-003`)
 */
export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super({
      code: `${resourceToErrorCode(resource)}_NOT_FOUND`,
      message: `The ${resource} "${id}" was not found.`,
      httpStatus: HttpStatus.NOT_FOUND,
    });
  }
}

/**
 * The caller is authenticated but not permitted to perform this action
 * **in their own OEM**.
 *
 * Do not use this for a record that belongs to another OEM — that is
 * NotFoundError. Returning 403 for out-of-scope access confirms the record
 * exists in another tenant. (`FR-TEN-003`)
 */
export class ForbiddenError extends DomainError {
  constructor(message = 'You are not permitted to perform this action.') {
    super({
      code: ErrorCode.FORBIDDEN,
      message,
      httpStatus: HttpStatus.FORBIDDEN,
    });
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication is required.') {
    super({
      code: ErrorCode.UNAUTHORIZED,
      message,
      httpStatus: HttpStatus.UNAUTHORIZED,
    });
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      httpStatus: HttpStatus.BAD_REQUEST,
    });
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(left: string, right: string) {
    super({
      code: ErrorCode.CURRENCY_MISMATCH,
      message: `Cannot combine ${left} with ${right}: Money values must share a currency`,
      httpStatus: HttpStatus.BAD_REQUEST,
    });
  }
}
