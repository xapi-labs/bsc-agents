#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = (path) => {
  assert.equal(typeof path, 'string');
  const absolute = resolve(root, path);
  assert(absolute.startsWith(root + sep), 'Artifact must be inside this repository');
  return absolute;
};
const read = (path) => JSON.parse(readFileSync(local(path), 'utf8'));
const legacy = read('releases.json');
const catalog = read(legacy.candidateCatalog);
assert.equal(legacy.runtimeProfile, 'agent-studio-worker-v6');
assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.backend.repository, 'https://github.com/xapi-labs/xapi-backend');
assert.match(catalog.backend.commit, /^[a-f0-9]{40}$/);
assert.equal(catalog.releases.length, 4);
const profiles = new Map([
  ['health-factor-monitoring', ['bnb-health-factor-v3', 'agent-studio-worker-v7']],
  ['yield-optimisation', ['bnb-yield-optimisation-v3', 'agent-studio-worker-v8']],
  ['grid-trading', ['bnb-grid-trading-v3', 'agent-studio-worker-v9']],
  ['liquidity-rebalancing', ['bnb-liquidity-rebalancing-v3', 'agent-studio-worker-v10']],
]);
const keys = new Set();
const slugs = new Set();
for (const release of catalog.releases) {
  assert(!keys.has(release.key), 'Duplicate release key');
  keys.add(release.key);
  assert.equal(release.status, 'candidate');
  const manifest = read(release.manifest);
  const metadata = read(release.metadata);
  const request = read(release.request);
  assert(!slugs.has(manifest.slug), 'Duplicate category');
  slugs.add(manifest.slug);
  assert.deepEqual(profiles.get(manifest.slug), [release.inputProfile, release.runtimeProfile]);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.engine, catalog.engine);
  assert.equal(manifest.inputProfile, release.inputProfile);
  assert.deepEqual(manifest.protocols, ['a2a', 'x402']);
  assert.equal(metadata.key, release.key);
  assert.equal(metadata.status, release.status);
  assert.equal(metadata.inputProfile, release.inputProfile);
  assert.equal(metadata.runtimeProfile, release.runtimeProfile);
  for (const key of ['studioCliVersion', 'workerEntrypoint', 'compatibilityDate']) {
    assert.equal(metadata[key], catalog[key]);
  }
  assert.equal(resolve(dirname(local(release.metadata)), metadata.manifest), local(release.manifest));
  assert(request.input && typeof request.input === 'object' && !Array.isArray(request.input));
  assert.equal(typeof request.prompt, 'string');
  assert(request.prompt.trim());
  assert(legacy.releases.some((entry) => entry.workspace === release.workspace));
  for (const path of [release.manifest, release.metadata, release.request]) {
    const bytes = readFileSync(local(path));
    const filename = path.split('/').at(-1);
    const expected = release.artifactSha256[filename];
    assert.match(expected, /^[a-f0-9]{64}$/);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `${path}: hash mismatch`);
    assert(!/sk-[A-Za-z0-9]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(bytes.toString()), `${path}: possible credential`);
  }
  console.log(`${release.key}: metadata and raw artifact hashes verified`);
}
console.log(`Verified ${keys.size} candidates against catalog provenance ${catalog.backend.commit}.`);
console.log('No backend execution, API calls or deployment performed.');
