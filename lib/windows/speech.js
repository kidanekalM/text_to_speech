const { runPowerShell, spawnPowerShell, escapePowerShellString } = require('./common');

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
    return [];
  }

  async resolveAudioDevice(name) {
    const target = String(name || '').trim();

    if (!target) {
      throw new Error('Audio device name is required.');
    }

    throw new Error(
      `Direct speech-device targeting is not implemented on Windows yet. Set the Windows default playback device to "${target}" instead.`
    );
  }
}

module.exports = {
  WindowsSpeech
};
