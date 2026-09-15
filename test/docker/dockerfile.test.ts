import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(
  path.join(import.meta.dirname, '../../Dockerfile'),
  'utf8',
);

describe('Dockerfile (Sprint 0 item 0.1)', () => {
  it('pins every FROM by digest and targets linux/arm64', () => {
    const fromLines = dockerfile
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('FROM '));

    expect(fromLines.length).toBeGreaterThanOrEqual(2);
    for (const line of fromLines) {
      expect(line).toMatch(/^FROM --platform=linux\/arm64 /);
      expect(line).toMatch(/@sha256:[a-f0-9]{64}/);
      expect(line).not.toMatch(/:[a-zA-Z0-9._-]+@/);
    }
  });

  it('runs as a non-root user', () => {
    expect(dockerfile).toMatch(/^USER (?!root\b)\S+/m);
    const users = dockerfile
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('USER '));
    expect(users.at(-1)).not.toBe('USER root');
  });
});
