/**
 * Firebase functions predeploy: build shared → pack into functions → npm install → tsc
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args, cwd = root) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npm', ['run', 'build', '-w', '@jobradar/shared']);
run('node', [join(root, 'scripts', 'pack-shared-for-functions.mjs')]);
run('npm', ['install'], join(root, 'functions'));
run('npm', ['run', 'build'], join(root, 'functions'));
