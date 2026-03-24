#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function resolveSource(argv) {
  const explicit = argv[2] || process.env.BLACKHOLE_PKG;

  if (!explicit) {
    fail('Provide the path to BlackHole2ch.pkg as the first argument or via BLACKHOLE_PKG.');
  }

  return path.resolve(explicit);
}

function ensurePkg(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    fail(`Source package not found: ${sourcePath}`);
  }

  if (!sourcePath.endsWith('.pkg')) {
    fail(`Expected a .pkg file, got: ${sourcePath}`);
  }
}

function main() {
  const sourcePath = resolveSource(process.argv);
  ensurePkg(sourcePath);

  const destinationDir = path.resolve(process.cwd(), 'resources', 'blackhole');
  const destinationPath = path.join(destinationDir, 'BlackHole2ch.pkg');

  fs.mkdirSync(destinationDir, { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);

  console.log(`Staged BlackHole package at ${destinationPath}`);
}

main();
