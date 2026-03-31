const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = process.cwd();
const projectFile = path.join(repoRoot, 'native', 'windows', 'AFAWindowsAudioHelper', 'AFAWindowsAudioHelper.csproj');
const targetDir = path.join(repoRoot, 'resources', 'native', 'windows-helper');
const targetBinary = path.join(targetDir, 'AFAWindowsAudioHelper.exe');

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (process.platform !== 'win32') {
  console.log('Skipping Windows helper build on non-Windows platform.');
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

const build = spawnSync('dotnet', [
  'publish',
  projectFile,
  '-c',
  'Release',
  '-r',
  'win-x64',
  '--self-contained',
  'false',
  '-o',
  targetDir
], {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (build.status !== 0) {
  fail('Failed to build AFAWindowsAudioHelper.');
}

if (!fs.existsSync(targetBinary)) {
  fail(`Built helper not found at ${targetBinary}`);
}

console.log(`Copied AFAWindowsAudioHelper to ${targetBinary}`);
