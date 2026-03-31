const {
  commandExists,
  parseLines,
  safeRun,
  listPactlEntries,
  listOutputDevices,
  listInputDevices,
  getDefaultOutputDevice
} = require('./common');

const LINUX_DRIVER_NAME = 'AFA Linux Virtual Audio';
const LINUX_VIRTUAL_DEVICE = 'afa_virtual_sink';
const LINUX_VIRTUAL_DEVICE_LABEL = 'AFA Virtual Sink';
const LINUX_LISTENER_DEVICE = 'afa_virtual_mic';
const LINUX_LISTENER_LABEL = 'AFA Virtual Mic';

async function listModules() {
  const result = await safeRun('pactl', ['list', 'short', 'modules']);

  if (!result.ok) {
    return [];
  }

  return parseLines(result.stdout).map((line) => {
    const parts = line.split('\t');
    return {
      id: parts[0] || '',
      name: parts[1] || '',
      args: parts.slice(2).join('\t')
    };
  });
}

class LinuxDriverManager {
  async inspect() {
    const hasPactl = await commandExists('pactl');
    const outputs = hasPactl ? await listOutputDevices().catch(() => []) : [];
    const inputs = hasPactl ? await listInputDevices().catch(() => []) : [];
    const modules = hasPactl ? await listModules() : [];
    const currentOutput = hasPactl ? await getDefaultOutputDevice().catch(() => '') : '';

    const sinkVisible = outputs.some((entry) => entry === LINUX_VIRTUAL_DEVICE || entry.includes(LINUX_VIRTUAL_DEVICE_LABEL));
    const sourceVisible = inputs.some((entry) => entry === LINUX_LISTENER_DEVICE || entry.includes(LINUX_LISTENER_LABEL));
    const sinkModule = modules.find((entry) => entry.name === 'module-null-sink' && entry.args.includes(`sink_name=${LINUX_VIRTUAL_DEVICE}`));
    const sourceModule = modules.find((entry) => entry.name === 'module-remap-source' && entry.args.includes(`source_name=${LINUX_LISTENER_DEVICE}`));
    const installed = sinkVisible && sourceVisible;
    const visible = installed;
    const ready = installed;

    const steps = [];

    if (!hasPactl) {
      steps.push('Install PipeWire or PulseAudio user tools that provide pactl.');
    } else if (!installed) {
      steps.push('Create the AFA virtual sink and virtual microphone.');
      steps.push(`Set your listener app microphone to "${LINUX_LISTENER_LABEL}".`);
    }

    return {
      driverName: LINUX_DRIVER_NAME,
      deviceName: LINUX_VIRTUAL_DEVICE,
      bundledInstallerPath: null,
      bundledPackagePath: null,
      bundledInstallerPresent: hasPactl,
      installed,
      visible,
      ready,
      restartRequired: false,
      currentOutput: currentOutput || null,
      currentOutputUsesDriver: currentOutput === LINUX_VIRTUAL_DEVICE,
      driverFiles: [sinkModule?.id, sourceModule?.id].filter(Boolean),
      packageIds: [],
      listenerDevice: LINUX_LISTENER_DEVICE,
      listenerLabel: LINUX_LISTENER_LABEL,
      steps
    };
  }

  async installBundledDriver() {
    if (!(await commandExists('pactl'))) {
      throw new Error('Linux virtual audio setup requires pactl from PipeWire or PulseAudio.');
    }

    const sinks = await listOutputDevices().catch(() => []);
    const sources = await listInputDevices().catch(() => []);

    if (!sinks.includes(LINUX_VIRTUAL_DEVICE)) {
      const sinkResult = await safeRun('bash', [
        '-lc',
        [
          'pactl load-module module-null-sink',
          `sink_name=${LINUX_VIRTUAL_DEVICE}`,
          `sink_properties=device.description='${LINUX_VIRTUAL_DEVICE_LABEL}'`
        ].join(' ')
      ]);

      if (!sinkResult.ok) {
        throw new Error(sinkResult.stderr || 'Failed to create the Linux virtual sink.');
      }
    }

    if (!sources.includes(LINUX_LISTENER_DEVICE)) {
      const sourceResult = await safeRun('bash', [
        '-lc',
        [
          'pactl load-module module-remap-source',
          `master=${LINUX_VIRTUAL_DEVICE}.monitor`,
          `source_name=${LINUX_LISTENER_DEVICE}`,
          `source_properties=device.description='${LINUX_LISTENER_LABEL}'`
        ].join(' ')
      ]);

      if (!sourceResult.ok) {
        throw new Error(sourceResult.stderr || 'Failed to create the Linux virtual microphone source.');
      }
    }

    return {
      ok: true,
      installed: true,
      installerPath: 'pactl',
      message: `Linux virtual audio is ready. Set your listener app microphone to "${LINUX_LISTENER_LABEL}".`
    };
  }
}

module.exports = {
  LinuxDriverManager,
  LINUX_DRIVER_NAME,
  LINUX_VIRTUAL_DEVICE,
  LINUX_VIRTUAL_DEVICE_LABEL,
  LINUX_LISTENER_DEVICE,
  LINUX_LISTENER_LABEL
};
