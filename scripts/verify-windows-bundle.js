#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REQUIRED_FILES = [
  {
    path: path.resolve(process.cwd(), 'resources', 'vbcable', 'VBCABLE_Driver_Pack45.zip'),
    label: 'VB-CABLE package zip'
  }
];

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function main() {
  const missing = REQUIRED_FILES.filter((entry) => !fs.existsSync(entry.path));

  if (missing.length > 0) {
    const details = missing.map((entry) => `- ${entry.label}: ${entry.path}`).join('\n');
    fail(
      `Windows bundle is incomplete.\n${details}\nStage the installer before building with:\n` +
      'npm run stage:vbcable -- C:\\path\\to\\VBCABLE_Driver_Pack45.zip'
    );
  }

  console.log('Windows bundle check passed.');
}

main();
