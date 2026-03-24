const { createPlatformServices, getDefaultVirtualDevice } = require('./platform');

function buildDefaultConfig(platform = process.platform) {
  const services = createPlatformServices(platform);

  return {
    voice: null,
    rate: 180,
    output: services.defaultVirtualDevice,
    speechOutput: services.defaultVirtualDevice,
    routingMode: 'device',
    startupWarning: null
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
      platform: this.platform,
      driverName: this.driverName
    };
  }

  async initialize(options = {}) {
    const driverState = await this.getDriverState();

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
    } else if (driverState.visible) {
      await this.setOutput(this.defaultVirtualDevice);
    } else {
      this.config.output = this.defaultVirtualDevice;
      this.config.speechOutput = this.defaultVirtualDevice;
      this.config.routingMode = 'deferred-output';
      this.config.startupWarning = driverState.installed
        ? `${this.driverName} is installed but not visible yet. A restart may be required before AFA can route into the virtual mic.`
        : `${this.driverName} is not installed yet. Install the bundled driver from AFA setup before using the virtual mic.`;
    }

    return this.getState();
  }

  async speak(text) {
    await this.speech.speak(text, this.config);
    return this.getState();
  }

  async stop() {
    await this.speech.stop();
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
      this.config.startupWarning = 'Device mode is active, but no output device has been selected yet.';
    }

    return this.getState();
  }

  async setOutput(value) {
    const target = String(value || '').trim();
    const driverState = await this.getDriverState();

    if (!target) {
      throw new Error('Output device name is required.');
    }

    this.config.routingMode = 'device';

    try {
      const resolvedOutput = await this.audioRouting.setOutputDevice(target);
      this.config.output = resolvedOutput;
      this.config.speechOutput = null;
      this.config.routingMode = 'system-switched';
      this.config.startupWarning = null;
      return this.getState();
    } catch (error) {
      const switchError = error instanceof Error ? error.message : String(error);

      const targetMatchesDriver =
        target.toLowerCase().includes(this.driverName.toLowerCase()) || target.toLowerCase().includes(this.defaultVirtualDevice.toLowerCase());

      if (targetMatchesDriver && !driverState.visible) {
        this.config.output = target;
        this.config.speechOutput = target;
        this.config.routingMode = 'deferred-output';
        this.config.startupWarning = driverState.installed
          ? `${switchError} ${this.driverName} is installed but not visible yet. Restart the system, then reopen AFA.`
          : `${switchError} ${this.driverName} is not installed yet. Install the bundled driver from AFA before speaking into the virtual mic.`;
        return this.getState();
      }

      try {
        const resolvedOutput = await this.speech.resolveAudioDevice(target);
        this.config.output = resolvedOutput;
        this.config.speechOutput = resolvedOutput;
        this.config.routingMode = 'direct-say';
        this.config.startupWarning = switchError;
        return this.getState();
      } catch (speechError) {
        const directError = speechError instanceof Error ? speechError.message : String(speechError);
        this.config.output = target;
        this.config.speechOutput = target;
        this.config.routingMode = 'deferred-output';
        this.config.startupWarning = `${switchError} ${directError}`;
        return this.getState();
      }
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

  getSetupSteps() {
    return this.setupSteps;
  }
}

module.exports = {
  AfaController,
  DEFAULT_LOOPBACK_DEVICE: getDefaultVirtualDevice(),
  buildDefaultConfig
};
