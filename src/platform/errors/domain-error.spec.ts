import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './domain-error.js';
import { ErrorCode } from './error-codes.js';

describe('domain errors', () => {
  it('gives NotFoundError a 404 and a SCREAMING_SNAKE code usable as a translation key', () => {
    const error = new NotFoundError('oem', 'oem-a');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.httpStatus).toBe(HttpStatus.NOT_FOUND);
    expect(error.code).toBe('OEM_NOT_FOUND');
    expect(error.message).toBe('The oem "oem-a" was not found.');
  });

  it('keeps ForbiddenError as an in-scope authorization denial (403)', () => {
    const error = new ForbiddenError();
    expect(error.httpStatus).toBe(HttpStatus.FORBIDDEN);
    expect(error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('maps remaining platform errors to stable codes', () => {
    expect(new UnauthorizedError().code).toBe(ErrorCode.UNAUTHORIZED);
    expect(new UnauthorizedError().httpStatus).toBe(HttpStatus.UNAUTHORIZED);
    expect(new ValidationError('email is required').code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
    expect(new ValidationError('email is required').httpStatus).toBe(
      HttpStatus.BAD_REQUEST,
    );
    const mismatch = new CurrencyMismatchError('EUR', 'GBP');
    expect(mismatch).toBeInstanceOf(DomainError);
    expect(mismatch.code).toBe(ErrorCode.CURRENCY_MISMATCH);
    expect(mismatch.httpStatus).toBe(HttpStatus.BAD_REQUEST);
  });
});
