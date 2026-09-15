import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTableColumns,
  getTableName,
  isTable,
  type Table,
} from 'drizzle-orm';
import { isTenantOwnedTableName } from './schema/tenant-owned.js';

const SCHEMA_DIR = fileURLToPath(new URL('./schema/', import.meta.url));
const SKIP_SCHEMA_FILES = new Set([
  'tenant-owned.ts',
  'tenant-owned.js',
]);

export class UnregisteredOemIdTableError extends Error {
  constructor(readonly tableNames: readonly string[]) {
    super(
      `Table(s) have oem_id but were not created through tenantOwned(): ${tableNames.join(', ')}`,
    );
    this.name = 'UnregisteredOemIdTableError';
  }
}

/**
 * Startup assertion, every environment including production. A table that
 * carries `oem_id` but skipped `tenantOwned()` is invisible to the
 * query hook and must not boot. (`FR-TEN-001`, `FR-TEN-002`)
 */
export function assertSchemaHasNoUnregisteredOemIdTables(): void {
  const names = [
    ...unregisteredOemIdTableNamesFromSchemaDirectory(SCHEMA_DIR),
  ];
  throwIfUnregistered(names);
}

export function assertNoUnregisteredOemIdTables(
  tables: readonly unknown[],
): void {
  throwIfUnregistered(unregisteredOemIdTableNamesFromTables(tables));
}

export function unregisteredOemIdTableNamesFromTables(
  tables: readonly unknown[],
): string[] {
  const names: string[] = [];
  for (const table of tables) {
    if (!isTable(table)) {
      continue;
    }
    if (!tableHasOemIdColumn(table)) {
      continue;
    }
    const name = getTableName(table);
    if (!isTenantOwnedTableName(name)) {
      names.push(name);
    }
  }
  return uniqueSorted(names);
}

export function unregisteredOemIdTableNamesFromSource(source: string): string[] {
  return uniqueSorted(
    mysqlTableNamesWithOemIdColumn(source).filter(
      (name) => !isTenantOwnedTableName(name),
    ),
  );
}

function unregisteredOemIdTableNamesFromSchemaDirectory(dir: string): string[] {
  const names: string[] = [];
  for (const file of listSchemaSourceFiles(dir)) {
    const source = readFileSync(file, 'utf8');
    names.push(...unregisteredOemIdTableNamesFromSource(source));
  }
  return uniqueSorted(names);
}

function throwIfUnregistered(names: readonly string[]): void {
  if (names.length === 0) {
    return;
  }
  throw new UnregisteredOemIdTableError(names);
}

function tableHasOemIdColumn(table: Table): boolean {
  return Object.values(getTableColumns(table)).some(
    (column) => column.name === 'oem_id',
  );
}

function listSchemaSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSchemaSourceFiles(full));
      continue;
    }
    if (!stat.isFile()) {
      continue;
    }
    if (SKIP_SCHEMA_FILES.has(entry)) {
      continue;
    }
    if (entry.endsWith('.d.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.test.ts')) {
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.js')) {
      continue;
    }
    out.push(full);
  }

  return out;
}

function mysqlTableNamesWithOemIdColumn(source: string): string[] {
  const names: string[] = [];
  const needle = 'mysqlTable(';
  let from = 0;

  while (from < source.length) {
    const start = source.indexOf(needle, from);
    if (start === -1) {
      break;
    }
    const parsed = parseMysqlTableArgs(source, start + needle.length);
    if (
      parsed !== undefined &&
      parsed.tableName !== undefined &&
      mentionsOemIdColumn(parsed.columnsSource)
    ) {
      names.push(parsed.tableName);
    }
    from = start + needle.length;
  }

  return names;
}

function parseMysqlTableArgs(
  source: string,
  argsStart: number,
): { tableName: string | undefined; columnsSource: string } | undefined {
  const first = readArgument(source, argsStart);
  if (first === undefined) {
    return undefined;
  }
  const afterComma = skipWsAndComments(source, first.end);
  if (source[afterComma] !== ',') {
    return undefined;
  }
  const second = readArgument(source, afterComma + 1);
  if (second === undefined) {
    return undefined;
  }
  return {
    tableName: stringLiteralValue(first.text),
    columnsSource: second.text,
  };
}

function readArgument(
  source: string,
  start: number,
): { text: string; end: number } | undefined {
  const i = skipWsAndComments(source, start);
  if (i >= source.length) {
    return undefined;
  }

  const quote = source[i];
  if (quote === "'" || quote === '"' || quote === '`') {
    const closed = readQuoted(source, i);
    if (closed === undefined) {
      return undefined;
    }
    return { text: source.slice(i, closed), end: closed };
  }

  if (source[i] === '{') {
    const closed = readBalanced(source, i, '{', '}');
    if (closed === undefined) {
      return undefined;
    }
    return { text: source.slice(i, closed), end: closed };
  }

  const end = readIdentifierOrExpr(source, i);
  return { text: source.slice(i, end), end };
}

function readQuoted(source: string, start: number): number | undefined {
  const quote = source[start];
  if (quote === undefined) {
    return undefined;
  }
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    i += 1;
  }
  return undefined;
}

function readBalanced(
  source: string,
  start: number,
  open: string,
  close: string,
): number | undefined {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quoted = readQuoted(source, i);
      if (quoted === undefined) {
        return undefined;
      }
      i = quoted;
      continue;
    }
    if (ch === open) {
      depth += 1;
    } else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
    i += 1;
  }
  return undefined;
}

function readIdentifierOrExpr(source: string, start: number): number {
  let i = start;
  let depth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === undefined) {
      break;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quoted = readQuoted(source, i);
      if (quoted === undefined) {
        return source.length;
      }
      i = quoted;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) {
        return i;
      }
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && (ch === ',' || ch === ')')) {
      return i;
    }
    i += 1;
  }
  return i;
}

function stringLiteralValue(text: string): string | undefined {
  const trimmed = text.trim();
  const quote = trimmed[0];
  if (
    (quote === "'" || quote === '"' || quote === '`') &&
    trimmed.length >= 2 &&
    trimmed[trimmed.length - 1] === quote
  ) {
    return trimmed.slice(1, -1);
  }
  return undefined;
}

function mentionsOemIdColumn(columnsSource: string): boolean {
  return (
    /\boemId\s*:/.test(columnsSource) ||
    /['"`]oem_id['"`]/.test(columnsSource)
  );
}

function skipWsAndComments(source: string, start: number): number {
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i);
      i = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

function uniqueSorted(names: readonly string[]): string[] {
  return [...new Set(names)].sort();
}
