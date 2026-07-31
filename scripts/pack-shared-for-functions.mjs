/**
 * Copy built @jobradar/shared into functions/ so Cloud Build can resolve
 * file:./packed-shared (workspace packages are not on npm).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages', 'shared');
const dest = join(root, 'functions', 'packed-shared');

if (!existsSync(join(src, 'dist', 'index.js'))) {
  console.error('packages/shared/dist missing — run: npm run build -w @jobradar/shared');
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(src, 'dist'), join(dest, 'dist'), { recursive: true });
cpSync(join(src, 'package.json'), join(dest, 'package.json'));

// Ensure package.json points at dist and has no workspace-only fields that confuse Cloud Build
const pkg = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'));
delete pkg.devDependencies;
delete pkg.scripts;
writeFileSync(join(dest, 'package.json'), JSON.stringify(pkg, null, 2));

console.log('Packed @jobradar/shared → functions/packed-shared');
