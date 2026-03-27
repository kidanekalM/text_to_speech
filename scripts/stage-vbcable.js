#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function resolveSource(argv) {
  const explicit = argv[2] || process.env.VBCABLE_SETUP;

  if (!explicit) {
    fail('Provide the path to VBCABLE_Setup_x64.exe as the first argument or via VBCABLE_SETUP.');
  }

  return path.resolve(explicit);
}

function main() {
  const sourcePath = resolveSource(process.argv);

  if (!fs.existsSync(sourcePath)) {
    fail(`Source installer not found: ${sourcePath}`);
  }

  const lowerSourcePath = sourcePath.toLowerCase();

  if (!lowerSourcePath.endsWith('.zip')) {
    fail(`Expected the official VB-CABLE zip package, got: ${sourcePath}`);
  }

  const destinationDir = path.resolve(process.cwd(), 'resources', 'vbcable');
  const destinationPath = path.join(destinationDir, 'VBCABLE_Driver_Pack45.zip');

  fs.mkdirSync(destinationDir, { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  console.log(`Staged VB-CABLE package at ${destinationPath}`);
}

main();
