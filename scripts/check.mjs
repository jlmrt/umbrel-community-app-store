import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  if (compose.includes('${APP_DATA_DIR}/data:')) {
    assert.ok(fs.existsSync(path.join(appRoot, 'data/.gitkeep')), `${appId} must commit its data bind-mount source`);
  }
  const preStart = path.join(appRoot, 'hooks/pre-start');
  if (fs.existsSync(preStart)) {
    assert.ok(fs.statSync(preStart).mode & 0o111, `${appId} pre-start hook must be executable`);
    const hookSyntax = spawnSync('bash', ['-n', preStart], { encoding: 'utf8' });
    assert.equal(hookSyntax.status, 0, hookSyntax.stderr || `${appId} pre-start hook syntax check failed`);
  }
  if (appId === 'jlmrt-pebble-proxy') {
    assert.match(manifest, /^version:\s*["']0\.1\.0-test\.13["']$/m);
    assert.match(manifest, /^icon:\s*https:\/\/raw\.githubusercontent\.com\/jlmrt\/PebbleProxy\/main\/icon\.svg$/m);
    assert.match(manifest, /^repo:\s*https:\/\/github\.com\/jlmrt\/PebbleProxy$/m);
    assert.match(compose, /ghcr\.io\/jlmrt\/pebble-proxy:sha-b79357b@sha256:20317f82982cb99f2e3e3ecdd0de56169dd056a53a51f7aed85ad345df7ac7b4/);
    assert.match(compose, /ghcr\.io\/jlmrt\/pebble-proxy-needle:sha-b79357b@sha256:9688b7596ea5471df52e49a6420a73969e451be092baf6e68f625274d8917f2e/);
    assert.match(compose, /PUBLIC_BASE_URL:\s*\$\{PEBBLE_PROXY_PUBLIC_BASE_URL:-\}/);
    assert.match(compose, /ALLOWED_PUBLIC_HOSTS:\s*\$\{PEBBLE_PROXY_ALLOWED_HOSTS:-\}/);
    assert.match(compose, /APP_HOST:\s*\$\{APP_ID:-pebble-proxy\}_admin_1/);
    assert.match(compose, /UMBREL_APP_ID:\s*\$\{APP_ID:-pebble-proxy\}/);
    assert.match(compose, /NEEDLE_ROUTER_URL:\s*http:\/\/needle:8090/);
    assert.match(compose, /processing_internal:\s*\n\s*internal:\s*true/);
    assert.match(compose, /NEEDLE_TELEMETRY:\s*["']0["']/);
    assert.match(compose, /HF_HUB_OFFLINE:\s*["']1["']/);
    const renderedCompose = compose.replace(
      /\$\{([A-Z0-9_]+):-([^}]*)\}/g,
      (_match, name, fallback) => ({ APP_ID: appId }[name] || fallback)
    );
    assert.match(renderedCompose, new RegExp(`APP_HOST:\\s*${appId}_admin_1`));
    assert.match(renderedCompose, new RegExp(`UMBREL_APP_ID:\\s*${appId}`));

    const exportsFile = path.join(appRoot, 'exports.sh');
    assert.ok(fs.existsSync(exportsFile), `${appId} requires exports.sh`);
    for (const exportId of [appId, 'another-store-pebble-proxy', '']) {
      const expectedId = exportId || 'pebble-proxy';
      const exported = spawnSync('bash', ['-c', 'set -u; source "$1"; printf "%s\\n%s\\n" "$APP_PEBBLE_PROXY_API_HOST" "$APP_PEBBLE_PROXY_API_URL"', 'bash', exportsFile], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH || '', EXPORTS_APP_ID: exportId }
      });
      assert.equal(exported.status, 0, exported.stderr || `${appId} exports.sh failed`);
      assert.deepEqual(exported.stdout.trim().split('\n'), [
        `${expectedId}_api_1`,
        `http://${expectedId}_api_1:8080`
      ]);
    }
    const invalidExport = spawnSync('bash', ['-c', 'set -u; source "$1"; printf "%s\\n" "$APP_PEBBLE_PROXY_API_URL"', 'bash', exportsFile], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH || '', EXPORTS_APP_ID: 'INVALID' }
    });
    assert.equal(invalidExport.status, 0, invalidExport.stderr || `${appId} exports.sh failed`);
    assert.equal(invalidExport.stdout.trim(), 'http://pebble-proxy_api_1:8080');
    assert.ok(fs.existsSync(preStart), `${appId} requires its data ownership migration hook`);
  }
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
