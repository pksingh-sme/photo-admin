import { describe, expect, it } from 'vitest';
import {
  REQUEST_ID_PATTERN,
  createRequestId,
  getRequestId,
  runWithRequestId,
} from './request-id.js';

describe('createRequestId', () => {
  it('returns a 26-character Crockford ULID', () => {
    const id = createRequestId();
    expect(id).toMatch(REQUEST_ID_PATTERN);
    expect(id).toHaveLength(26);
  });

  it('stores the id for loggers in the same async context', () => {
    expect(getRequestId()).toBeUndefined();
    const id = createRequestId();
    runWithRequestId(id, () => {
      expect(getRequestId()).toBe(id);
    });
    expect(getRequestId()).toBeUndefined();
  });
});
