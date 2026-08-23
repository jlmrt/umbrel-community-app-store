import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const store = fs.readFileSync(path.join(root, 'umbrel-app-store.yml'), 'utf8');
const storeId = store.match(/^id:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1];

assert.equal(storeId, 'jlmrt', 'Store ID must remain stable');

const appDirectories = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${storeId}-`))
  .map((entry) => entry.name);

assert.ok(appDirectories.length > 0, 'Store must contain at least one app');

const assignedPorts = new Map();

for (const appId of appDirectories) {
  const appRoot = path.join(root, appId);
  for (const required of ['umbrel-app.yml', 'docker-compose.yml', 'icon.svg']) {
    assert.ok(fs.existsSync(path.join(appRoot, required)), `${appId} is missing ${required}`);
  }

  const manifest = fs.readFileSync(path.join(appRoot, 'umbrel-app.yml'), 'utf8');
  const compose = fs.readFileSync(path.join(appRoot, 'docker-compose.yml'), 'utf8');
  assert.match(manifest, new RegExp(`^id:\\s*${appId}$`, 'm'), `${appId} manifest ID must match its directory`);
  const port = Number(manifest.match(/^port:\s*["']?(\d+)/m)?.[1]);
  assert.ok(Number.isInteger(port) && port >= 1000 && port <= 9999, `${appId} must use a four-digit app port`);
  assert.ok(!assignedPorts.has(port), `${appId} duplicates port ${port} used by ${assignedPorts.get(port)}`);
  assignedPorts.set(port, appId);
  assert.doesNotMatch(compose, /^\s*build:/m, `${appId} must pull a published image`);
  assert.match(compose, /^\s*image:\s*\S+/m, `${appId} must declare a container image`);
  for (const image of compose.matchAll(/^\s*image:\s*(\S+)/gm)) {
    assert.match(image[1], /@sha256:[a-f0-9]{64}$/, `${appId} images must be pinned to an immutable digest`);
  }
}

const provenancePattern = /Wrist AI|interoperability test client|as requested|per your request|you asked|the user (?:asked|requested|specified|wanted)|generated from (?:the |a )?(?:user.?s )?prompt/i;
const textExtensions = new Set(['.md', '.mjs', '.js', '.json', '.yml', '.yaml', '.sh', '.svg']);

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    if (path.relative(root, absolute) === 'scripts/check.mjs') continue;
    if (entry.isDirectory()) scan(absolute);
    else if (textExtensions.has(path.extname(entry.name))) {
      assert.doesNotMatch(fs.readFileSync(absolute, 'utf8'), provenancePattern, `Private provenance detected in ${path.relative(root, absolute)}`);
    }
  }
}

scan(root);
console.log(`Validated ${appDirectories.length} Umbrel app package(s).`);
