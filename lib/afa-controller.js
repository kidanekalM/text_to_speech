const { Speech } = require('./speech');
const { AudioRouting } = require('./audio-routing');
const { Doctor } = require('./doctor');
const { DriverManager, DEFAULT_VIRTUAL_DEVICE } = require('./driver-manager');

function buildDefaultConfig() {
  return {
    voice: null,
    rate: 180,
    output: DEFAULT_VIRTUAL_DEVICE,
    speechOutput: DEFAULT_VIRTUAL_DEVICE,
    routingMode: 'device',
    startupWarning: null
  };
}

class AfaController {
  constructor({ config } = {}) {
    this.speech = new Speech();
    this.audioRouting = new AudioRouting();
    this.doctor = new Doctor();
    this.driverManager = new DriverManager();
    this.config = {
      ...buildDefaultConfig(),
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
      startupWarning: this.config.startupWarning
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
      await this.setOutput(DEFAULT_VIRTUAL_DEVICE);
    } else {
      this.config.output = DEFAULT_VIRTUAL_DEVICE;
      this.config.speechOutput = DEFAULT_VIRTUAL_DEVICE;
      this.config.routingMode = 'deferred-output';
      this.config.startupWarning = driverState.installed
        ? 'BlackHole is installed but not visible yet. A restart is usually required before AFA can route into the virtual mic.'
        : 'BlackHole is not installed yet. Install the bundled driver from AFA setup before using the virtual mic.';
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

      if (target.toLowerCase().includes('blackhole') && !driverState.visible) {
        this.config.output = target;
        this.config.speechOutput = target;
        this.config.routingMode = 'deferred-output';
        this.config.startupWarning = driverState.installed
          ? `${switchError} BlackHole is installed but not visible yet. Restart macOS, then reopen AFA.`
          : `${switchError} BlackHole is not installed yet. Install the bundled driver from AFA before speaking into the virtual mic.`;
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
    return [
      'Install the bundled BlackHole driver when AFA asks for it.',
      'Restart macOS if AFA says the driver is installed but not visible yet.',
      `AFA will target "${DEFAULT_VIRTUAL_DEVICE}" automatically.`,
      `In Zoom or another listener app, set the microphone to "${DEFAULT_VIRTUAL_DEVICE}".`
    ];
  }
}

module.exports = {
  AfaController,
  DEFAULT_LOOPBACK_DEVICE: DEFAULT_VIRTUAL_DEVICE,
  buildDefaultConfig
};
