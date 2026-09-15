import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { NotFoundError } from './domain-error.js';
import { ErrorCode } from './error-codes.js';
import { mapException } from './map-exception.js';
import { GENERIC_INTERNAL_MESSAGE } from './unsafe-message.js';

describe('mapException', () => {
  it('maps NotFoundError without altering its 404', () => {
    const mapped = mapException(new NotFoundError('oem', 'oem-a'));
    expect(mapped.status).toBe(HttpStatus.NOT_FOUND);
    expect(mapped.code).toBe('OEM_NOT_FOUND');
    expect(mapped.logUnhandled).toBe(false);
  });

  it('never copies a driver or SQL message into the client payload', () => {
    const mapped = mapException(
      new Error('ER_PARSE_ERROR: SELECT * FROM orders'),
    );
    expect(mapped.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mapped.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(mapped.message).toBe(GENERIC_INTERNAL_MESSAGE);
    expect(mapped.logUnhandled).toBe(true);
    expect(mapped.message).not.toMatch(/SELECT/);
  });

  it('maps Nest HttpException status without spreading the raw payload', () => {
    const mapped = mapException(
      new HttpException(
        { message: 'nope', stack: 'at secret' },
        HttpStatus.NOT_FOUND,
      ),
    );
    expect(mapped.status).toBe(HttpStatus.NOT_FOUND);
    expect(mapped.code).toBe(ErrorCode.NOT_FOUND);
    expect(mapped.message).toBe('nope');
  });
});
