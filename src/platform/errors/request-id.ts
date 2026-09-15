import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export const REQUEST_ID_HEADER = 'x-request-id';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const requestIdStorage = new AsyncLocalStorage<string>();

/**
 * ULID (26 Crockford characters). Matches the request-id shape in
 * ENGINEERING-STANDARDS §3 (`01J8X…`).
 */
export function createRequestId(
  now = Date.now(),
  entropy: Uint8Array = randomBytes(10),
): string {
  return (
    encodeCrockford(BigInt(now), 10) +
    encodeCrockford(bytesToBigInt(entropy), 16)
  );
}

export function getRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

export function readRequestId(request: unknown): string | undefined {
  if (typeof request !== 'object' || request === null) {
    return undefined;
  }
  if (!('requestId' in request)) {
    return undefined;
  }
  const value = request.requestId;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function enterRequestId(requestId: string): void {
  requestIdStorage.enterWith(requestId);
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestIdStorage.run(requestId, fn);
}

export const REQUEST_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function encodeCrockford(value: bigint, length: number): string {
  let remaining = value;
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const index = Number(remaining % 32n);
    const character = CROCKFORD[index];
    if (character === undefined) {
      throw new Error('ULID encoding out of range');
    }
    out = character + out;
    remaining = remaining / 32n;
  }
  return out;
}
