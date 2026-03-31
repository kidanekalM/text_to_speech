const os = require('os');
const { runPowerShell } = require('./common');
const { WINDOWS_DRIVER_NAME } = require('./driver-manager');
const { listRenderEndpoints, getDefaultRenderEndpointName } = require('./audio-endpoints');

function parseLines(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function safePowerShell(script) {
  try {
    const result = await runPowerShell(script);
    return {
      ok: result.code === 0,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

class WindowsDoctor {
  async inspect() {
    const [voices, devices, endpoints, currentOutput] = await Promise.all([
      safePowerShell(
        'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }'
      ),
      safePowerShell("Get-CimInstance Win32_SoundDevice | Sort-Object Name | Select-Object -ExpandProperty Name"),
      listRenderEndpoints().catch(() => []),
      getDefaultRenderEndpointName().catch(() => '')
    ]);

    const voiceList = voices.ok ? parseLines(voices.stdout) : [];
    const deviceList = devices.ok ? parseLines(devices.stdout) : [];
    const cableDevices = endpoints
      .map((entry) => entry.Name)
      .filter(Boolean)
      .filter((entry) => entry.toLowerCase().includes('cable'));

    const notes = [];

    if (!voices.ok) {
      notes.push(`Windows voice check failed: ${voices.stderr || 'unknown error'}`);
    } else if (voiceList.length === 0) {
      notes.push('Windows returned zero installed voices.');
    }

    if (!devices.ok) {
      notes.push(`Windows sound-device check failed: ${devices.stderr || 'unknown error'}`);
    } else if (deviceList.length === 0) {
      notes.push('Windows returned zero sound devices.');
    }

    if (cableDevices.length === 0) {
      notes.push('VB-CABLE is not visible in Windows playback endpoints yet.');
    }

    return {
      osVersion: os.release(),
      driverName: WINDOWS_DRIVER_NAME,
      voiceCount: voiceList.length,
      audioDeviceCount: endpoints.length,
      cableDevices,
      sayAudioCount: endpoints.length,
      switchOutputCount: endpoints.length,
      currentOutput: currentOutput || null,
      blackHoleInHal: cableDevices,
      blackHoleInPackages: [],
      notes
    };
  }
}

module.exports = {
  WindowsDoctor
};
