const { spawn } = require('child_process');
const {
  findBestMatch,
  shellEscape,
  detectFirstAvailable,
  listOutputDevices,
  safeRun
} = require('./common');

function parseEspeakVoices(raw) {
  return String(raw || '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return parts[3] || parts[4] || '';
    })
    .filter(Boolean);
}

function clampRate(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return 180;
  }

  return Math.max(80, Math.min(400, parsed));
}

class LinuxSpeech {
  constructor() {
    this.currentProcess = null;
    this.ttsEngine = null;
    this.playbackEngine = null;
  }

  async getTtsEngine() {
    if (!this.ttsEngine) {
      this.ttsEngine = await detectFirstAvailable(['espeak-ng', 'espeak', 'spd-say']);
    }

    return this.ttsEngine;
  }

  async getPlaybackEngine() {
    if (!this.playbackEngine) {
      this.playbackEngine = await detectFirstAvailable(['pw-play', 'paplay']);
    }

    return this.playbackEngine;
  }

  async speak(text, options = {}) {
    const trimmed = String(text || '').trim();

    if (!trimmed) {
      return;
    }

    const engine = await this.getTtsEngine();

    if (!engine) {
      throw new Error('Linux speech requires espeak-ng, espeak, or spd-say.');
    }

    if (options.speechOutput) {
      await this.runTargetedSpeech(engine, trimmed, options);
      return;
    }

    await this.runDefaultSpeech(engine, trimmed, options);
  }

  async runDefaultSpeech(engine, text, options = {}) {
    const rate = clampRate(options.rate);
    let command = '';

    if (engine === 'spd-say') {
      command = ['spd-say', shellEscape(text)].join(' ');
    } else {
      const voiceArg = options.voice ? ` -v ${shellEscape(options.voice)}` : '';
      command = `${engine} -s ${rate}${voiceArg} ${shellEscape(text)}`;
    }

    await this.spawnShellCommand(command);
  }

  async runTargetedSpeech(engine, text, options = {}) {
    if (engine === 'spd-say') {
      throw new Error('Direct Linux speech-device targeting requires espeak-ng or espeak.');
    }

    const playbackEngine = await this.getPlaybackEngine();

    if (!playbackEngine) {
      throw new Error('Direct Linux speech-device targeting requires pw-play or paplay.');
    }

    const rate = clampRate(options.rate);
    const sink = shellEscape(options.speechOutput);
    const voiceArg = options.voice ? ` -v ${shellEscape(options.voice)}` : '';
    let playCommand = '';

    if (playbackEngine === 'pw-play') {
      playCommand = `pw-play --target ${sink} "$tmp_wav"`;
    } else if (playbackEngine === 'paplay') {
      playCommand = `paplay --device=${sink} "$tmp_wav"`;
    }

    const command = [
      'tmp_wav=$(mktemp --suffix=.wav)',
      'cleanup() { rm -f "$tmp_wav"; }',
      'trap cleanup EXIT',
      `${engine} -w "$tmp_wav" -s ${rate}${voiceArg} ${shellEscape(text)}`,
      playCommand
    ].join('; ');

    await this.spawnShellCommand(command);
  }

  async spawnShellCommand(command) {
    await new Promise((resolve, reject) => {
      const child = spawn('bash', ['-lc', command], {
        stdio: ['ignore', 'ignore', 'pipe']
      });

      this.currentProcess = child;
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        this.currentProcess = null;
        reject(error);
      });

      child.on('close', (code, signal) => {
        this.currentProcess = null;

        if (signal === 'SIGTERM') {
          resolve();
          return;
        }

        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `Linux speech exited with code ${code}`));
      });
    });
  }

  async stop() {
    if (!this.currentProcess) {
      return;
    }

    this.currentProcess.kill('SIGTERM');
    this.currentProcess = null;
  }

  async listVoices() {
    const engine = await this.getTtsEngine();

    if (!engine || engine === 'spd-say') {
      return [];
    }

    const result = await safeRun(engine, ['--voices']);

    if (!result.ok) {
      throw new Error(result.stderr || 'Failed to list Linux speech voices.');
    }

    return Array.from(new Set(parseEspeakVoices(result.stdout)));
  }

  async resolveVoice(name) {
    const target = String(name || '').trim();

    if (!target) {
      throw new Error('Voice name is required.');
    }

    const voices = await this.listVoices();

    if (voices.length === 0) {
      return target;
    }

    const match = findBestMatch(voices, target);

    if (!match) {
      throw new Error(`Voice "${target}" was not found in Linux speech voices.`);
    }

    return match;
  }

  async listAudioDevices() {
    return listOutputDevices();
  }

  async resolveAudioDevice(name) {
    const target = String(name || '').trim();

    if (!target) {
      throw new Error('Audio device name is required.');
    }

    const devices = await this.listAudioDevices();

    if (devices.length === 0) {
      return target;
    }

    const match = findBestMatch(devices, target);

    if (!match) {
      throw new Error(`Audio device "${target}" was not found in Linux output devices.`);
    }

    return match;
  }
}

module.exports = {
  LinuxSpeech
};
