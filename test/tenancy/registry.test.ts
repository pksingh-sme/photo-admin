import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listTenantOwnedTableNames } from '../../src/data/schema/tenant-owned.js';

const TEST_DIR = import.meta.dirname;
const SCHEMA_DIR = path.resolve(TEST_DIR, '../../src/data/schema');
const TENANCY_DIR = TEST_DIR;

const ASSERT_ISOLATION_CALL =
  /\bassertTenantIsolation\s*\(\s*(?:'([^']+)'|"([^"]+)")/g;

/**
 * Every `tenantOwned()` table in `src/data/schema/**` must have a matching
 * `assertTenantIsolation(...)` suite. Zero tables → pass. A new table without
 * a suite fails and names it. (`FR-TEN-010`)
 */
describe('FR-TEN-010 tenant-owned registry', () => {
  it('requires an isolation suite for every tenantOwned table', async () => {
    await importSchemaModules();

    const tables = listTenantOwnedTableNames();
    const suites = await listIsolationSuiteTableNames();
    const missing = tables.filter((name) => !suites.has(name));

    expect(
      missing,
      missing.length === 0
        ? 'every tenant-owned table has an isolation suite'
        : `Tenant-owned table(s) missing assertTenantIsolation(...) suite (FR-TEN-010): ${missing.join(', ')}`,
    ).toEqual([]);
  });
});

async function importSchemaModules(): Promise<void> {
  const files = await listTypeScriptFiles(SCHEMA_DIR);
  await Promise.all(
    files.map(async (absFile) => {
      await import(toImportSpecifier(TEST_DIR, absFile));
    }),
  );
}

async function listIsolationSuiteTableNames(): Promise<Set<string>> {
  const files = await listTypeScriptFiles(TENANCY_DIR);
  const names = new Set<string>();

  for (const absFile of files) {
    const source = await readFile(absFile, 'utf8');
    ASSERT_ISOLATION_CALL.lastIndex = 0;
    for (const match of source.matchAll(ASSERT_ISOLATION_CALL)) {
      const name = match[1] ?? match[2];
      if (name !== undefined) {
        names.add(name);
      }
    }
  }

  return names;
}

async function listTypeScriptFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listTypeScriptFiles(full)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue;
    }
    if (entry.name.endsWith('.d.ts')) {
      continue;
    }
    out.push(full);
  }

  return out;
}

function toImportSpecifier(fromDir: string, absFile: string): string {
  const relative = path.relative(fromDir, absFile).split(path.sep).join('/');
  const dotted = relative.startsWith('.') ? relative : `./${relative}`;
  return dotted.replace(/\.ts$/, '.js');
}
