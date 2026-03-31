const {
  listRenderEndpoints,
  getDefaultRenderEndpointName,
  setDefaultRenderEndpoint,
  listCaptureEndpoints,
  getDefaultCaptureEndpointName,
  setDefaultCaptureEndpoint
} = require('./audio-endpoints');

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
    const endpoints = await listRenderEndpoints();
    return endpoints.map((endpoint) => endpoint.Name).filter(Boolean);
  }

  async getCurrentOutputDevice() {
    return getDefaultRenderEndpointName();
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
      throw new Error(`Output device "${target}" was not found in Windows playback endpoints.`);
    }

    return match;
  }

  async setOutputDevice(name) {
    const target = String(name || '').trim();
    const endpoints = await listRenderEndpoints();

    if (!target) {
      throw new Error('Output device name is required.');
    }

    const names = endpoints.map((endpoint) => endpoint.Name).filter(Boolean);
    const resolvedName = names.length > 0 ? findBestMatch(names, target) : target;

    if (!resolvedName) {
      throw new Error(`Output device "${target}" was not found in Windows playback endpoints.`);
    }

    const endpoint = endpoints.find((entry) => entry.Name === resolvedName);

    if (!endpoint) {
      throw new Error(`Output device "${resolvedName}" was not found in Windows playback endpoints.`);
    }

    await setDefaultRenderEndpoint(endpoint.Id);
    return resolvedName;
  }

  async listInputDevices() {
    const endpoints = await listCaptureEndpoints();
    return endpoints.map((endpoint) => endpoint.Name).filter(Boolean);
  }

  async getCurrentInputDevice() {
    return getDefaultCaptureEndpointName();
  }

  async resolveInputDevice(name) {
    const target = String(name || '').trim();

    if (!target) {
      throw new Error('Input device name is required.');
    }

    const devices = await this.listInputDevices();

    if (devices.length === 0) {
      return target;
    }

    const match = findBestMatch(devices, target);

    if (!match) {
      throw new Error(`Input device "${target}" was not found in Windows capture endpoints.`);
    }

    return match;
  }

  async setInputDevice(name) {
    const target = String(name || '').trim();
    const endpoints = await listCaptureEndpoints();

    if (!target) {
      throw new Error('Input device name is required.');
    }

    const names = endpoints.map((endpoint) => endpoint.Name).filter(Boolean);
    const resolvedName = names.length > 0 ? findBestMatch(names, target) : target;

    if (!resolvedName) {
      throw new Error(`Input device "${target}" was not found in Windows capture endpoints.`);
    }

    const endpoint = endpoints.find((entry) => entry.Name === resolvedName);

    if (!endpoint) {
      throw new Error(`Input device "${resolvedName}" was not found in Windows capture endpoints.`);
    }

    await setDefaultCaptureEndpoint(endpoint.Id);
    return resolvedName;
  }
}

module.exports = {
  WindowsAudioRouting
};
