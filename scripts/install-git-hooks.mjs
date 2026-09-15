import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
if (process.env['CI'] === 'true' || process.env['CI'] === '1') {
  process.exit(0);
}

const gitDir = path.join(root, '.git');
if (!existsSync(gitDir)) {
  process.exit(0);
}

const hooksDir = path.join(gitDir, 'hooks');
mkdirSync(hooksDir, { recursive: true });

const source = path.join(root, '.githooks', 'pre-commit');
const destination = path.join(hooksDir, 'pre-commit');
copyFileSync(source, destination);
chmodSync(destination, 0o755);
