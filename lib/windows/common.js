const { spawn } = require('child_process');
const { runCommand } = require('../command-runner');

function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function runPowerShell(script) {
  return runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encodePowerShell(script)
  ]);
}

function spawnPowerShell(script) {
  return spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)],
    {
      stdio: ['ignore', 'ignore', 'pipe']
    }
  );
}

function escapePowerShellString(value) {
  return String(value || '').replace(/'/g, "''");
}

module.exports = {
  runPowerShell,
  spawnPowerShell,
  escapePowerShellString
};
