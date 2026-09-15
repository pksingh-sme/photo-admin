import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findTenantRequestBindings,
  type FindingKind,
} from './check-no-tenant-in-request.js';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/tenant-in-request',
);

const FIXTURES: ReadonlyArray<{
  file: string;
  kind: FindingKind;
  name: string;
}> = [
  { file: 'class-dto.ts', kind: 'dto-property', name: 'oemId' },
  { file: 'req-decorator.ts', kind: 'raw-request', name: 'Req' },
  { file: 'fastify-hook.ts', kind: 'hook-read', name: 'oemId' },
  { file: 'header-read.ts', kind: 'header', name: 'x-oem-id' },
  { file: 'nested-zod.ts', kind: 'zod-key', name: 'oemId' },
  { file: 'query-decorator.ts', kind: 'decorator', name: 'oemId' },
];

describe('FR-API-003 tenant-in-request checker', () => {
  it('rejects every fixture by kind and name', async () => {
    const onDisk = (await readdir(fixtureDir))
      .filter((name) => name.endsWith('.ts'))
      .sort();
    expect(onDisk).toEqual([...FIXTURES.map((item) => item.file)].sort());

    const findings = await findTenantRequestBindings({ roots: [fixtureDir] });

    for (const fixture of FIXTURES) {
      const hit = findings.find(
        (finding) =>
          finding.file.endsWith(`tenant-in-request/${fixture.file}`) &&
          finding.kind === fixture.kind &&
          finding.name === fixture.name,
      );
      expect(hit, `${fixture.file} must report ${fixture.kind} '${fixture.name}'`).toBeDefined();
    }
  });

  it('finds nested, array, union and extend Zod keys in nested-zod.ts', async () => {
    const findings = await findTenantRequestBindings({ roots: [fixtureDir] });
    const names = findings
      .filter((finding) => finding.file.endsWith('nested-zod.ts'))
      .map((finding) => finding.name)
      .sort();
    expect(names).toEqual(['oemCode', 'oemId', 'oemId', 'tenantId'].sort());
  });

  it('finds nothing under src/', async () => {
    const findings = await findTenantRequestBindings();
    expect(findings).toEqual([]);
  });
});
