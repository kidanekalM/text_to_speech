const { runPowerShell } = require('./common');

function parseLines(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function findBestMatch(values, target) {
  const normalizedTarget = target.toLowerCase();
  const exact = values.find((value) => value.toLowerCase() === normalizedTarget);

  if (exact) {
    return exact;
  }

  const startsWith = values.filter((value) => value.toLowerCase().startsWith(normalizedTarget));

  if (startsWith.length === 1) {
    return startsWith[0];
  }

  const contains = values.filter((value) => value.toLowerCase().includes(normalizedTarget));

  if (contains.length === 1) {
    return contains[0];
  }

  return null;
}

class WindowsAudioRouting {
  async listOutputDevices() {
    const result = await runPowerShell(
      "Get-CimInstance Win32_SoundDevice | Sort-Object Name | Select-Object -ExpandProperty Name"
    );

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'Failed to list Windows sound devices.');
    }

    return parseLines(result.stdout);
  }

  async getCurrentOutputDevice() {
    return '';
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

    const match = findBestMatch(devices, target);

    if (!match) {
      throw new Error(`Output device "${target}" was not found in Windows sound devices.`);
    }

    return match;
  }

  async setOutputDevice(name) {
    const resolvedName = await this.resolveOutputDevice(name);

    throw new Error(
      `Automatic output switching is not implemented on Windows yet. Set the default playback device to "${resolvedName}" manually in Windows sound settings.`
    );
  }
}

module.exports = {
  WindowsAudioRouting
};
