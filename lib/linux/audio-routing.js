const {
  findBestMatch,
  commandExists,
  safeRun,
  listOutputDevices,
  getDefaultOutputDevice
} = require('./common');

class LinuxAudioRouting {
  async listOutputDevices() {
    const devices = await listOutputDevices();

    if (devices.length === 0) {
      throw new Error('No Linux output devices were returned. Install PipeWire or PulseAudio tooling such as pactl.');
    }

    return devices;
  }

  async getCurrentOutputDevice() {
    return getDefaultOutputDevice();
  }

  async resolveOutputDevice(name) {
    const target = String(name || '').trim();

    if (!target) {
      throw new Error('Output device name is required.');
    }

    const devices = await this.listOutputDevices();
    const match = findBestMatch(devices, target);

    if (!match) {
      throw new Error(`Output device "${target}" was not found in Linux audio outputs.`);
    }

    return match;
  }

  async setOutputDevice(name) {
    const resolvedName = await this.resolveOutputDevice(name);

    if (await commandExists('pactl')) {
      const result = await safeRun('pactl', ['set-default-sink', resolvedName]);

      if (!result.ok) {
        throw new Error(result.stderr || `Failed to switch Linux output device to "${resolvedName}".`);
      }

      return resolvedName;
    }

    throw new Error('Automatic Linux output switching requires pactl.');
  }
}

module.exports = {
  LinuxAudioRouting
};
