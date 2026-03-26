const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = process.cwd();
const sourceFile = path.join(repoRoot, 'native', 'macos', 'Sources', 'AFAAudioHelper', 'main.swift');
const targetDir = path.join(repoRoot, 'resources', 'native');
const targetBinary = path.join(targetDir, 'AFAAudioHelper');

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (process.platform !== 'darwin') {
  console.log('Skipping macOS helper build on non-macOS platform.');
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

const build = spawnSync('xcrun', [
  'swiftc',
  '-O',
  '-framework',
  'CoreAudio',
  sourceFile,
  '-o',
  targetBinary
], {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (build.status !== 0) {
  fail('Failed to build AFAAudioHelper.');
}

if (!fs.existsSync(targetBinary)) {
  fail(`Built helper not found at ${targetBinary}`);
}

fs.chmodSync(targetBinary, 0o755);

console.log(`Copied AFAAudioHelper to ${targetBinary}`);
