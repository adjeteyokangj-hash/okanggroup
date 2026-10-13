/**
 * Assemble unified static dist for Vercel:
 * - Public site already in dist/ from root `vite build`
 * - Operations / Client Portal from admin/dist → dist/admin/
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteDist = join(root, 'dist');
const adminDist = join(root, 'admin', 'dist');
const adminOut = join(siteDist, 'admin');

if (!existsSync(siteDist)) {
  console.error('Missing dist/ — run npm run build first');
  process.exit(1);
}
if (!existsSync(adminDist)) {
  console.error('Missing admin/dist/ — run npm run admin:build first');
  process.exit(1);
}

rmSync(adminOut, { recursive: true, force: true });
mkdirSync(adminOut, { recursive: true });
cpSync(adminDist, adminOut, { recursive: true });
console.log('Assembled dist/admin from admin/dist');
