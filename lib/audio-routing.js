const { runCommand } = require('./command-runner');

function parseDeviceListJson(raw) {
  if (!raw.trim()) {
    return [];
  }

  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed.devices)) {
    return parsed.devices;
  }

  if (Array.isArray(parsed.output)) {
    return parsed.output;
  }

  return [];
}

function normalizeDeviceName(device) {
  if (typeof device === 'string') {
    return device.trim();
  }

  if (!device || typeof device !== 'object') {
    return '';
  }

  return String(device.name || device.device || device.description || '').trim();
}

function findBestDeviceMatch(devices, target) {
  const normalizedTarget = target.toLowerCase();
  const exact = devices.find((device) => device.toLowerCase() === normalizedTarget);

  if (exact) {
    return exact;
  }

  const startsWith = devices.filter((device) => device.toLowerCase().startsWith(normalizedTarget));

  if (startsWith.length === 1) {
    return startsWith[0];
  }

  const contains = devices.filter((device) => device.toLowerCase().includes(normalizedTarget));

  if (contains.length === 1) {
    return contains[0];
  }

  return null;
}

class AudioRouting {
  async listOutputDevices() {
    const jsonResult = await runCommand('SwitchAudioSource', ['-a', '-f', 'json', '-t', 'output']);

    if (jsonResult.code === 0) {
      try {
        const devices = parseDeviceListJson(jsonResult.stdout)
          .map(normalizeDeviceName)
          .filter(Boolean);

        if (devices.length > 0) {
          return devices;
        }
      } catch (error) {
        // Fall back to human-readable output if JSON parsing fails.
      }
    }

    const humanResult = await runCommand('SwitchAudioSource', ['-a', '-f', 'human', '-t', 'output']);

    if (humanResult.code !== 0) {
      throw new Error(humanResult.stderr.trim() || 'Failed to list output devices.');
    }

    return humanResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async getCurrentOutputDevice() {
    const result = await runCommand('SwitchAudioSource', ['-c', '-t', 'output']);

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'Failed to read current output device.');
    }

    return result.stdout.trim();
  }

  async resolveOutputDevice(name) {
    const target = String(name || '').trim();

    if (!target) {
      throw new Error('Output device name is required.');
    }

    const devices = await this.listOutputDevices();

    if (devices.length === 0) {
      return target;
    }

    const match = findBestDeviceMatch(devices, target);

    if (!match) {
      throw new Error(
        `Output device "${target}" was not found. Run "/outputs" or "node app.js --list-outputs" to see available devices.`
      );
    }

    return match;
  }

  async setOutputDevice(name) {
    const devices = await this.listOutputDevices();
    const resolvedName = devices.length > 0 ? await this.resolveOutputDevice(name) : String(name || '').trim();
    const result = await runCommand('SwitchAudioSource', ['-t', 'output', '-s', resolvedName]);

    if (result.code !== 0) {
      const details = result.stderr.trim() || result.stdout.trim();

      if (devices.length === 0) {
        throw new Error(
          `Failed to switch output device to "${resolvedName}". SwitchAudioSource did not return any visible output devices in this shell. Verify the virtual device exists and is visible in Audio MIDI Setup or Sound settings, then run "SwitchAudioSource -a -t output" directly in Terminal.`
        );
      }

      throw new Error(details || `Failed to switch output device to "${resolvedName}".`);
    }

    return resolvedName;
  }
}

module.exports = {
  AudioRouting
};
