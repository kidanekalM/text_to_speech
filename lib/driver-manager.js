const fs = require('fs');
const path = require('path');
const { runCommand } = require('./command-runner');

const DEFAULT_VIRTUAL_DEVICE = 'BlackHole 2ch';
const DEFAULT_DRIVER_NAME = 'BlackHole';

function parseLines(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function findBundledInstallerPath() {
  const resourceBase = process.resourcesPath && process.resourcesPath !== process.cwd() ? process.resourcesPath : null;
  const candidates = [
    resourceBase ? path.join(resourceBase, 'blackhole', 'BlackHole2ch.pkg') : null,
    resourceBase ? path.join(resourceBase, 'blackhole', 'BlackHole.pkg') : null,
    resourceBase ? path.join(resourceBase, 'resources', 'blackhole', 'BlackHole2ch.pkg') : null,
    path.join(process.cwd(), 'resources', 'blackhole', 'BlackHole2ch.pkg'),
    path.join(process.cwd(), 'resources', 'blackhole', 'BlackHole.pkg'),
    path.join(process.cwd(), 'vendor', 'blackhole', 'BlackHole2ch.pkg')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function safeRun(command, args) {
  try {
    const result = await runCommand(command, args);
    return {
      ok: result.code === 0,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

class DriverManager {
  async inspect() {
    const bundledInstallerPath = findBundledInstallerPath();
    const [
      halEntries,
      packages,
      sayDevices,
      outputs,
      currentOutput
    ] = await Promise.all([
      safeRun('ls', ['-1', '/Library/Audio/Plug-Ins/HAL']),
      safeRun('pkgutil', ['--pkgs']),
      safeRun('say', ['-a', '?']),
      safeRun('SwitchAudioSource', ['-a', '-t', 'output']),
      safeRun('SwitchAudioSource', ['-c', '-t', 'output'])
    ]);

    const halList = halEntries.ok ? parseLines(halEntries.stdout) : [];
    const packageList = packages.ok ? parseLines(packages.stdout) : [];
    const sayDeviceList = sayDevices.ok ? parseLines(sayDevices.stdout) : [];
    const outputList = outputs.ok ? parseLines(outputs.stdout) : [];

    const driverFiles = halList.filter((entry) => entry.toLowerCase().includes('blackhole'));
    const packageIds = packageList.filter((entry) => entry.toLowerCase().includes('blackhole'));
    const sayVisible = sayDeviceList.some((entry) => entry.toLowerCase().includes('blackhole'));
    const outputVisible = outputList.some((entry) => entry.toLowerCase().includes('blackhole'));
    const currentOutputUsesDriver = (currentOutput.stdout || '').toLowerCase().includes('blackhole');

    const installed = driverFiles.length > 0 || packageIds.length > 0;
    const visible = sayVisible || outputVisible;
    const ready = installed && visible;
    const restartRequired = installed && !visible;

    const steps = [];

    if (!installed) {
      steps.push('Install the bundled BlackHole driver.');
    }

    if (restartRequired) {
      steps.push('Restart macOS so the audio driver becomes visible.');
    }

    if (ready && !currentOutputUsesDriver) {
      steps.push('Set your listener app microphone to BlackHole 2ch.');
    }

    return {
      driverName: DEFAULT_DRIVER_NAME,
      deviceName: DEFAULT_VIRTUAL_DEVICE,
      bundledInstallerPath,
      bundledInstallerPresent: Boolean(bundledInstallerPath),
      installed,
      visible,
      ready,
      restartRequired,
      currentOutput: currentOutput.stdout || null,
      currentOutputUsesDriver,
      driverFiles,
      packageIds,
      steps
    };
  }

  async installBundledDriver() {
    const bundledInstallerPath = findBundledInstallerPath();

    if (!bundledInstallerPath) {
      throw new Error('Bundled BlackHole installer not found. Package BlackHole2ch.pkg inside resources/blackhole before shipping.');
    }

    const escapedPath = bundledInstallerPath.replace(/"/g, '\\"');
    const script = `do shell script "/usr/sbin/installer -pkg \\"${escapedPath}\\" -target /" with administrator privileges`;
    const result = await safeRun('osascript', ['-e', script]);

    if (!result.ok) {
      throw new Error(result.stderr || 'BlackHole installer failed.');
    }

    return {
      ok: true,
      installed: true,
      installerPath: bundledInstallerPath,
      message: 'BlackHole installer completed. Restart macOS if AFA still says the virtual mic is not visible.'
    };
  }
}

module.exports = {
  DriverManager,
  DEFAULT_DRIVER_NAME,
  DEFAULT_VIRTUAL_DEVICE
};
