import { scoped } from './scoped.js';
import type { TenantContext } from '../platform/tenant/tenant-context.js';

type Database = Parameters<typeof scoped>[1];

/**
 * Base for tenant-owned repositories. The database is reached only through
 * `scoped()`. Do not import `src/data/internal`. (`FR-TEN-001`, `FR-TEN-002`)
 */
export abstract class TenantRepository {
  constructor(private readonly db: Database) {}

  protected scoped(ctx: TenantContext) {
    return scoped(ctx, this.db);
  }
}
