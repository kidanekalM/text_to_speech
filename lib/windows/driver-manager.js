const fs = require('fs');
const path = require('path');
const { runPowerShell } = require('./common');

const WINDOWS_DRIVER_NAME = 'VB-CABLE';
const WINDOWS_VIRTUAL_DEVICE = 'CABLE Input';
const WINDOWS_LISTENER_DEVICE = 'CABLE Output';

function findBundledInstallerPath() {
  const resourceBase = process.resourcesPath && process.resourcesPath !== process.cwd() ? process.resourcesPath : null;
  const candidates = [
    resourceBase ? path.join(resourceBase, 'vbcable', 'VBCABLE_Setup_x64.exe') : null,
    resourceBase ? path.join(resourceBase, 'vbcable', 'VBCABLE_Setup.exe') : null,
    path.join(process.cwd(), 'resources', 'vbcable', 'VBCABLE_Setup_x64.exe'),
    path.join(process.cwd(), 'resources', 'vbcable', 'VBCABLE_Setup.exe')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

class WindowsDriverManager {
  async inspect() {
    const bundledInstallerPath = findBundledInstallerPath();
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
      bundledInstallerPresent: Boolean(bundledInstallerPath),
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
    const bundledInstallerPath = findBundledInstallerPath();

    if (!bundledInstallerPath) {
      throw new Error(
        'Bundled VB-CABLE installer not found. Package VBCABLE_Setup_x64.exe inside resources/vbcable before shipping.'
      );
    }

    const escapedPath = bundledInstallerPath.replace(/'/g, "''");
    const script = `Start-Process -FilePath '${escapedPath}' -Verb RunAs`;
    const result = await runPowerShell(script);

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'VB-CABLE installer failed.');
    }

    return {
      ok: true,
      installed: true,
      installerPath: bundledInstallerPath,
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
