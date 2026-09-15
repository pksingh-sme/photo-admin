import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../errors/domain-error.js';
import { zodPipe } from './zod-pipe.js';

const echoSchema = z.object({
  name: z.string(),
});

describe('zodPipe', () => {
  const pipe = zodPipe(echoSchema);

  it('returns parsed data when the payload matches the schema', () => {
    expect(pipe.transform({ name: 'ok' }, { type: 'body' })).toEqual({
      name: 'ok',
    });
  });

  it('throws ValidationError rather than a class-validator HttpException', () => {
    try {
      pipe.transform({ name: 1 }, { type: 'body' });
      throw new Error('expected ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      if (!(error instanceof ValidationError)) {
        return;
      }
      expect(error.httpStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toMatch(/name/);
    }
  });
});
