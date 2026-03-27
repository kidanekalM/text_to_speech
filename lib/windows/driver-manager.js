const fs = require('fs');
const os = require('os');
const path = require('path');
const { runPowerShell, escapePowerShellString } = require('./common');

const WINDOWS_DRIVER_NAME = 'VB-CABLE';
const WINDOWS_VIRTUAL_DEVICE = 'CABLE Input';
const WINDOWS_LISTENER_DEVICE = 'CABLE Output';

function getBundledResourceBase() {
  const resourceBase = process.resourcesPath && process.resourcesPath !== process.cwd() ? process.resourcesPath : null;
  return resourceBase || path.join(process.cwd(), 'resources');
}

function listBundledResourceBases() {
  const candidates = [
    process.resourcesPath || null,
    getBundledResourceBase(),
    path.join(process.cwd(), 'resources'),
    path.resolve(__dirname, '..', '..', 'resources'),
    path.resolve(process.cwd(), '..', 'resources')
  ].filter(Boolean);

  return [...new Set(candidates)];
}

function findBundledInstallerPath() {
  const candidates = listBundledResourceBases().flatMap((resourceBase) => [
    path.join(resourceBase, 'vbcable', 'VBCABLE_Setup_x64.exe'),
    path.join(resourceBase, 'vbcable', 'VBCABLE_Setup.exe')
  ]);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function findBundledPackagePath() {
  const candidates = listBundledResourceBases().flatMap((resourceBase) => [
    path.join(resourceBase, 'vbcable', 'VBCABLE_Driver_Pack45.zip'),
    path.join(resourceBase, 'vbcable', 'VBCABLE_Driver_Pack43.zip')
  ]);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function listExpectedBundledPackagePaths() {
  return listBundledResourceBases().flatMap((resourceBase) => [
    path.join(resourceBase, 'vbcable', 'VBCABLE_Driver_Pack45.zip'),
    path.join(resourceBase, 'vbcable', 'VBCABLE_Driver_Pack43.zip')
  ]);
}

class WindowsDriverManager {
  async inspect() {
    const bundledInstallerPath = findBundledInstallerPath();
    const bundledPackagePath = findBundledPackagePath();
    const result = await runPowerShell("Get-CimInstance Win32_SoundDevice | Sort-Object Name | Select-Object -ExpandProperty Name");
    const devices = (result.stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const cableDevices = devices.filter((entry) => entry.toLowerCase().includes('cable'));
    const installed = cableDevices.length > 0;
    const visible = installed;
    const ready = installed;

    const steps = [];

    if (!installed) {
      steps.push('Install the bundled VB-CABLE driver.');
      steps.push('Set Windows playback to CABLE Input and your listener app microphone to CABLE Output.');
    }

    return {
      driverName: WINDOWS_DRIVER_NAME,
      deviceName: WINDOWS_VIRTUAL_DEVICE,
      bundledInstallerPath,
      bundledPackagePath,
      bundledInstallerPresent: Boolean(bundledPackagePath || bundledInstallerPath),
      installed,
      visible,
      ready,
      restartRequired: false,
      currentOutput: null,
      currentOutputUsesDriver: false,
      driverFiles: cableDevices,
      packageIds: [],
      steps
    };
  }

  async installBundledDriver() {
    const bundledPackagePath = findBundledPackagePath();
    const bundledInstallerPath = findBundledInstallerPath();

    if (!bundledPackagePath && !bundledInstallerPath) {
      const searchedPaths = listExpectedBundledPackagePaths()
        .map((candidate) => `- ${candidate}`)
        .join('\n');
      throw new Error(
        'Bundled VB-CABLE package not found. Expected one of these paths:\n' +
        `${searchedPaths}\n` +
        'Package VBCABLE_Driver_Pack45.zip inside resources/vbcable before shipping.'
      );
    }

    let script = '';
    let launchedPath = bundledInstallerPath;

    if (bundledPackagePath) {
      const tempDir = path.join(os.tmpdir(), `afa-vbcable-${Date.now()}`);
      const escapedZipPath = escapePowerShellString(bundledPackagePath);
      const escapedTempDir = escapePowerShellString(tempDir);
      launchedPath = path.join(tempDir, 'VBCABLE_Setup_x64.exe');
      const escapedLaunchedPath = escapePowerShellString(launchedPath);
      script = `
$zipPath = '${escapedZipPath}'
$tempDir = '${escapedTempDir}'
$setupPath = '${escapedLaunchedPath}'
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Expand-Archive -LiteralPath $zipPath -DestinationPath $tempDir -Force
if (-not (Test-Path -LiteralPath $setupPath)) {
  throw 'VBCABLE_Setup_x64.exe was not found after extracting the bundled package.'
}
Start-Process -FilePath $setupPath -WorkingDirectory $tempDir -Verb RunAs
`;
    } else {
      const escapedPath = escapePowerShellString(bundledInstallerPath);
      const escapedDir = escapePowerShellString(path.dirname(bundledInstallerPath));
      script = `Start-Process -FilePath '${escapedPath}' -WorkingDirectory '${escapedDir}' -Verb RunAs`;
    }

    const result = await runPowerShell(script);

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'VB-CABLE installer failed.');
    }

    return {
      ok: true,
      installed: true,
      installerPath: launchedPath,
      message: 'VB-CABLE installer launched. Complete the Windows install flow, then reopen AFA.'
    };
  }
}

module.exports = {
  WindowsDriverManager,
  WINDOWS_DRIVER_NAME,
  WINDOWS_VIRTUAL_DEVICE,
  WINDOWS_LISTENER_DEVICE
};
