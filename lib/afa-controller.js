const { createPlatformServices, getDefaultVirtualDevice } = require('./platform');

function buildDefaultConfig(platform = process.platform) {
  const services = createPlatformServices(platform);

  return {
    voice: null,
    rate: 180,
    output: null,
    speechOutput: null,
    routingMode: 'system',
    startupWarning: null,
    lastSafeOutput: null
  };
}

class AfaController {
  constructor({ config, platform } = {}) {
    const services = createPlatformServices(platform);

    this.platform = services.platform;
    this.speech = services.speech;
    this.audioRouting = services.audioRouting;
    this.doctor = services.doctor;
    this.driverManager = services.driverManager;
    this.driverName = services.driverName;
    this.defaultVirtualDevice = services.defaultVirtualDevice;
    this.listenerDevice = services.listenerDevice;
    this.setupSteps = services.setupSteps;
    this.config = {
      ...buildDefaultConfig(this.platform),
      ...(config || {})
    };
  }

  getState() {
    return {
      voice: this.config.voice,
      rate: this.config.rate,
      output: this.config.output,
      speechOutput: this.config.speechOutput,
      routingMode: this.config.routingMode,
      startupWarning: this.config.startupWarning,
      lastSafeOutput: this.config.lastSafeOutput,
      platform: this.platform,
      driverName: this.driverName
    };
  }

  isVirtualDeviceName(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (!normalized) {
      return false;
    }

    return [
      this.driverName,
      this.defaultVirtualDevice,
      this.listenerDevice,
      'blackhole',
      'vb-cable',
      'cable input',
      'cable output'
    ]
      .filter(Boolean)
      .some((candidate) => normalized.includes(String(candidate).toLowerCase()));
  }

  rememberSafeOutput(value) {
    const normalized = String(value || '').trim();

    if (!normalized || this.isVirtualDeviceName(normalized)) {
      return;
    }

    this.config.lastSafeOutput = normalized;
  }

  async rememberCurrentSafeOutput() {
    try {
      const currentOutput = await this.audioRouting.getCurrentOutputDevice();
      this.rememberSafeOutput(currentOutput);
    } catch (error) {
      // Ignore read failures; recovery will fall back later.
    }
  }

  async getRestoreOutputCandidate() {
    if (this.config.lastSafeOutput) {
      return this.config.lastSafeOutput;
    }

    try {
      const currentOutput = await this.audioRouting.getCurrentOutputDevice();

      if (currentOutput && !this.isVirtualDeviceName(currentOutput)) {
        return currentOutput;
      }
    } catch (error) {
      // Fall through to device list probing.
    }

    try {
      const outputs = await this.audioRouting.listOutputDevices();
      const realOutputs = outputs.filter((output) => !this.isVirtualDeviceName(output));

      const preferred = realOutputs.find((output) =>
        /(built-in|internal|speaker|headphone|macbook|airpods)/i.test(output)
      );

      if (preferred) {
        return preferred;
      }

      return realOutputs[0] || null;
    } catch (error) {
      return null;
    }
  }

  async initialize(options = {}) {
    await this.rememberCurrentSafeOutput();

    if (options.voice) {
      this.config.voice = await this.speech.resolveVoice(options.voice);
    }

    if (options.rate) {
      this.setRate(options.rate);
    }

    if (options.mode) {
      this.setMode(options.mode);
    }

    if (options.output) {
      await this.setOutput(options.output);
    } else if (this.config.routingMode === 'device' && this.config.output) {
      await this.setOutput(this.config.output);
    } else {
      this.config.output = null;
      this.config.speechOutput = null;
      this.config.routingMode = 'system';
      this.config.startupWarning = null;
    }

    return this.getState();
  }

  async speak(text) {
    if (this.config.routingMode === 'device' && !this.config.speechOutput) {
      throw new Error(`Virtual mic is not ready yet. Set Output to "${this.defaultVirtualDevice}" and click Apply after the device becomes visible.`);
    }

    await this.speech.speak(text, this.config);
    return this.getState();
  }

  async stop() {
    await this.speech.stop();
  }

  async shutdown() {
    await this.speech.stop();

    try {
      const currentOutput = await this.audioRouting.getCurrentOutputDevice();

      if (currentOutput && this.isVirtualDeviceName(currentOutput) && this.config.lastSafeOutput) {
        await this.audioRouting.setOutputDevice(this.config.lastSafeOutput);
      }
    } catch (error) {
      // Best-effort restore only.
    }
  }

  async listVoices() {
    return this.speech.listVoices();
  }

  async listOutputs() {
    return this.audioRouting.listOutputDevices();
  }

  async inspect() {
    return this.doctor.inspect();
  }

  async getDriverState() {
    return this.driverManager.inspect();
  }

  async installDriver() {
    return this.driverManager.installBundledDriver();
  }

  async ensureBundledDriverForVirtualTarget(driverState) {
    if (this.platform !== 'win32') {
      return null;
    }

    if (driverState.installed || !driverState.bundledInstallerPresent) {
      return null;
    }

    return this.installDriver();
  }

  async setVoice(value) {
    const normalized = String(value || '').trim();

    if (!normalized || ['default', 'system'].includes(normalized.toLowerCase())) {
      this.config.voice = null;
      return this.getState();
    }

    this.config.voice = await this.speech.resolveVoice(normalized);
    return this.getState();
  }

  setRate(value) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed < 50 || parsed > 600) {
      throw new Error('Rate must be a number between 50 and 600.');
    }

    this.config.rate = parsed;
    return this.getState();
  }

  setMode(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (!['system', 'device'].includes(normalized)) {
      throw new Error('Mode must be either "system" or "device".');
    }

    this.config.routingMode = normalized;

    if (normalized === 'system') {
      this.config.output = null;
      this.config.speechOutput = null;
      this.config.startupWarning = null;
    } else if (!this.config.output) {
      this.config.output = this.defaultVirtualDevice;
      this.config.speechOutput = null;
      this.config.startupWarning = `Device mode is armed for "${this.defaultVirtualDevice}". Click Apply after the virtual mic is visible.`;
    }

    return this.getState();
  }

  async setOutput(value) {
    const target = String(value || '').trim();
    let driverState = await this.getDriverState();

    if (!target) {
      throw new Error('Output device name is required.');
    }

    this.config.routingMode = 'device';

    await this.rememberCurrentSafeOutput();

    if (this.isVirtualDeviceName(target)) {
      const installResult = await this.ensureBundledDriverForVirtualTarget(driverState);

      if (installResult) {
        this.config.output = target;
        this.config.speechOutput = null;
        this.config.routingMode = 'device';
        this.config.startupWarning = installResult.message || `Launching bundled ${this.driverName} installer.`;
        return this.getState();
      }

      try {
        const resolvedOutput = await this.speech.resolveAudioDevice(target);
        this.config.output = resolvedOutput;
        this.config.speechOutput = resolvedOutput;
        this.config.routingMode = 'device';
        this.config.startupWarning = `Virtual mic ready on "${resolvedOutput}".`;
        return this.getState();
      } catch (_error) {
        this.config.output = target;
        this.config.speechOutput = null;
        this.config.routingMode = 'device';
        this.config.startupWarning = driverState.installed
          ? `${this.driverName} is installed, but AFA cannot verify "${target}" yet. AFA will stay in speaker-safe mode until the device test succeeds.`
          : `${this.driverName} is not installed yet. Install the bundled driver before using virtual mic mode.`;
        return this.getState();
      }
    }

    try {
      const resolvedOutput = await this.audioRouting.setOutputDevice(target);
      this.config.output = resolvedOutput;
      this.config.speechOutput = null;
      this.config.routingMode = 'system';
      this.config.startupWarning = `System output switched to "${resolvedOutput}".`;
      this.rememberSafeOutput(resolvedOutput);
      return this.getState();
    } catch (error) {
      const switchError = error instanceof Error ? error.message : String(error);

      const targetMatchesDriver =
        target.toLowerCase().includes(this.driverName.toLowerCase()) || target.toLowerCase().includes(this.defaultVirtualDevice.toLowerCase());

      if (targetMatchesDriver && !driverState.visible) {
        const installResult = await this.ensureBundledDriverForVirtualTarget(driverState);

        if (installResult) {
          this.config.output = target;
          this.config.speechOutput = null;
          this.config.routingMode = 'device';
          this.config.startupWarning = installResult.message || `Launching bundled ${this.driverName} installer.`;
          return this.getState();
        }

        this.config.output = target;
        this.config.speechOutput = target;
        this.config.routingMode = 'deferred-output';
        this.config.startupWarning = driverState.installed
          ? `${switchError} ${this.driverName} is installed but not visible yet. Restart the system, then reopen AFA.`
          : `${switchError} ${this.driverName} is not installed yet. Install the bundled driver from AFA before speaking into the virtual mic.`;
        return this.getState();
      }

      this.config.output = target;
      this.config.speechOutput = null;
      this.config.routingMode = 'system';
      this.config.startupWarning = switchError;
      return this.getState();
    }
  }

  async getStatus() {
    let output = this.config.output || 'System default';

    if (this.config.routingMode === 'system') {
      try {
        const currentOutput = await this.audioRouting.getCurrentOutputDevice();

        if (currentOutput) {
          output = currentOutput;
        }
      } catch (error) {
        // Keep last known output when current output cannot be read.
      }
    }

    return {
      ...this.getState(),
      output
    };
  }

  async restoreNormalAudio() {
    const target = await this.getRestoreOutputCandidate();

    if (!target) {
      throw new Error('No normal speaker device was found. Open macOS Sound settings and select your built-in speakers or headphones once, then try again.');
    }

    const resolvedOutput = await this.audioRouting.setOutputDevice(target);
    this.rememberSafeOutput(resolvedOutput);
    this.config.output = resolvedOutput;
    this.config.speechOutput = null;
    this.config.routingMode = 'system';
    this.config.startupWarning = `Restored normal audio to "${resolvedOutput}".`;
    return this.getState();
  }

  async testSpeaker() {
    let currentOutput = null;

    try {
      currentOutput = await this.audioRouting.getCurrentOutputDevice();
    } catch (error) {
      // Continue and attempt restore if needed.
    }

    if (!currentOutput || this.isVirtualDeviceName(currentOutput)) {
      await this.restoreNormalAudio();
    }

    await this.speech.speak('AFA speaker test.', {
      voice: this.config.voice,
      rate: this.config.rate
    });

    return this.getState();
  }

  async getAudioSafety() {
    let currentOutput = null;

    try {
      currentOutput = await this.audioRouting.getCurrentOutputDevice();
    } catch (error) {
      // Leave null if the system API cannot report it.
    }

    const restoreTarget = await this.getRestoreOutputCandidate();

    return {
      currentOutput,
      lastSafeOutput: this.config.lastSafeOutput,
      canRestore: Boolean(restoreTarget),
      restoreTarget,
      virtualOutputActive: this.isVirtualDeviceName(currentOutput),
      directVirtualRouting: this.config.routingMode === 'device' && Boolean(this.config.speechOutput) && this.isVirtualDeviceName(this.config.output)
    };
  }

  getSetupSteps() {
    return this.setupSteps;
  }
}

module.exports = {
  AfaController,
  DEFAULT_LOOPBACK_DEVICE: getDefaultVirtualDevice(),
  buildDefaultConfig
};
