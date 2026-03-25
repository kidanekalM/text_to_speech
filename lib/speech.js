const { spawn } = require('child_process');
const { runCommand } = require('./command-runner');

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

function parseSayAudioDeviceLine(line) {
  const trimmed = String(line || '').trim();

  if (!trimmed) {
    return null;
  }

  const indexedMatch = trimmed.match(/^\d+[\s.:\-)\]]+(.+)$/);

  if (indexedMatch) {
    return indexedMatch[1].trim();
  }

  return trimmed;
}

class Speech {
  constructor() {
    this.currentProcess = null;
  }

  async speak(text, options = {}) {
    try {
      await this.runSay(text, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (options.voice && message.includes('Voice `') && message.includes('not found')) {
        const fallbackOptions = {
          ...options,
          voice: null
        };

        await this.runSay(text, fallbackOptions);
        return;
      }

      throw error;
    }
  }

  async runSay(text, options = {}) {
    const trimmed = String(text || '').trim();

    if (!trimmed) {
      return;
    }

    const args = [];

    if (options.voice) {
      args.push('-v', options.voice);
    }

    if (options.rate) {
      args.push('-r', String(options.rate));
    }

    if (options.speechOutput) {
      args.push('-a', options.speechOutput);
    }

    args.push(trimmed);

    return new Promise((resolve, reject) => {
      const child = spawn('say', args, {
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

        reject(new Error(stderr.trim() || `say exited with code ${code}`));
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
    const result = await runCommand('say', ['-v', '?']);

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'Failed to list macOS voices.');
    }

    const voices = result.stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.+?)\s{2,}\S+/);
        return match ? match[1].trim() : line.trim();
      });

    return Array.from(new Set(voices));
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

    const match = voices.find((voice) => voice.toLowerCase() === target.toLowerCase());

    if (!match) {
      throw new Error(
        `Voice "${target}" was not found. Run "/voices" or "node app.js --list-voices" to see available voices.`
      );
    }

    return match;
  }

  async listAudioDevices() {
    const result = await runCommand('say', ['-a', '?']);

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'Failed to list say audio devices.');
    }

    return result.stdout
      .split('\n')
      .map(parseSayAudioDeviceLine)
      .filter(Boolean);
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
      throw new Error(
        `Audio device "${target}" was not found by say. Run "say -a '?'" to inspect devices visible to the speech engine.`
      );
    }

    return match;
  }
}

module.exports = {
  Speech
};
