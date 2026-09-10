import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(
  readFileSync(join(root, 'releases/candidates.json'), 'utf8'),
);
const dryRun = process.argv.includes('--dry-run');

for (const release of catalog.releases) {
  const args = [
    'exec',
    'wrangler',
    'deploy',
    '--config',
    join('workers', release.key, 'wrangler.jsonc'),
  ];
  if (dryRun) args.push('--dry-run', '--outdir', join('/tmp', `bsc-agents-${release.key}`));
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
