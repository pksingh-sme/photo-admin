import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Caller OEM for the non-production query hook. Repositories still take
 * `TenantContext` as an explicit first parameter — this store is not a
 * query API. (`FR-TEN-002`)
 *
 * Entered from verified credentials (the request interceptor, a job, or a
 * test). Never from a header, query, path or body. (`FR-API-003`)
 */
const callerOem = new AsyncLocalStorage<string>();

export function runWithCallerOem<T>(oemId: string, fn: () => T): T {
  return callerOem.run(oemId, fn);
}

export function getCallerOemId(): string | undefined {
  return callerOem.getStore();
}
