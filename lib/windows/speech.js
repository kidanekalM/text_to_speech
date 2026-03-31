const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { runPowerShell, spawnPowerShell, escapePowerShellString } = require('./common');
const { listRenderEndpoints } = require('./audio-endpoints');
const { resolveWindowsHelperPath } = require('./audio-helper');

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

function toWindowsSpeechRate(wordsPerMinute) {
  const rate = Math.round((Number(wordsPerMinute || 180) - 180) / 20);
  return Math.max(-10, Math.min(10, rate));
}

class WindowsSpeech {
  constructor() {
    this.currentProcess = null;
  }

  async speak(text, options = {}) {
    const trimmed = String(text || '').trim();

    if (!trimmed) {
      return;
    }

    if (options.speechOutput) {
      await this.speakToDevice(trimmed, options);
      return;
    }

    const escapedText = escapePowerShellString(trimmed);
    const escapedVoice = options.voice ? escapePowerShellString(options.voice) : null;
    const rate = toWindowsSpeechRate(options.rate);
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      escapedVoice ? `$speaker.SelectVoice('${escapedVoice}')` : '',
      `$speaker.Rate = ${rate}`,
      '$speaker.SetOutputToDefaultAudioDevice()',
      `$speaker.Speak('${escapedText}')`
    ]
      .filter(Boolean)
      .join('; ');

    await new Promise((resolve, reject) => {
      const child = spawnPowerShell(script);
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

        reject(new Error(stderr.trim() || `Windows speech exited with code ${code}`));
      });
    });
  }

  async speakToDevice(text, options = {}) {
    const helperPath = resolveWindowsHelperPath();

    if (!helperPath) {
      throw new Error('Windows audio helper is not built. Run "node scripts/build-windows-helper.js" before testing direct device routing.');
    }

    const wavPath = path.join(os.tmpdir(), `afa-speech-${Date.now()}.wav`);
    await this.synthesizeWaveFile(text, wavPath, options);

    const args = [
      'play-wav',
      '--wav',
      wavPath,
      '--device',
      options.speechOutput,
      '--mirror-default'
    ];

    await new Promise((resolve, reject) => {
      const child = spawn(helperPath, args, {
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
          fs.rmSync(wavPath, { force: true });
          resolve();
          return;
        }

        if (code === 0) {
          fs.rmSync(wavPath, { force: true });
          resolve();
          return;
        }

        fs.rmSync(wavPath, { force: true });
        reject(new Error(stderr.trim() || `Windows audio helper exited with code ${code}`));
      });
    });
  }

  async synthesizeWaveFile(text, wavPath, options = {}) {
    const escapedText = escapePowerShellString(text);
    const escapedPath = escapePowerShellString(wavPath);
    const escapedVoice = options.voice ? escapePowerShellString(options.voice) : null;
    const rate = toWindowsSpeechRate(options.rate);
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      escapedVoice ? `$speaker.SelectVoice('${escapedVoice}')` : '',
      `$speaker.Rate = ${rate}`,
      `$speaker.SetOutputToWaveFile('${escapedPath}')`,
      `$speaker.Speak('${escapedText}')`,
      '$speaker.Dispose()'
    ]
      .filter(Boolean)
      .join('; ');

    const result = await runPowerShell(script);

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'Failed to synthesize Windows speech to WAV.');
    }
  }

  async stop() {
    if (!this.currentProcess) {
      return;
    }

    this.currentProcess.kill('SIGTERM');
    this.currentProcess = null;
  }

  async listVoices() {
    const result = await runPowerShell(
      'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }'
    );

    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'Failed to list Windows voices.');
    }

    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
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
      throw new Error(`Voice "${target}" was not found. Install or enable that Windows voice first.`);
    }

    return match;
  }

  async listAudioDevices() {
    const endpoints = await listRenderEndpoints();
    return endpoints.map((endpoint) => endpoint.Name).filter(Boolean);
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
      throw new Error(`Audio device "${target}" was not found in Windows playback endpoints.`);
    }

    return match;
  }
}

module.exports = {
  WindowsSpeech
};
