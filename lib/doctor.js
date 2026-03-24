const os = require('os');
const { runCommand } = require('./command-runner');
const { DEFAULT_DRIVER_NAME } = require('./driver-manager');

function parseLines(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function safeRun(command, args) {
  try {
    const result = await runCommand(command, args);
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

class Doctor {
  async inspect() {
    const [
      sayVoices,
      sayAudioDevices,
      switchOutputs,
      switchCurrent,
      blackHoleFiles,
      blackHolePackages
    ] = await Promise.all([
      safeRun('say', ['-v', '?']),
      safeRun('say', ['-a', '?']),
      safeRun('SwitchAudioSource', ['-a', '-t', 'output']),
      safeRun('SwitchAudioSource', ['-c', '-t', 'output']),
      safeRun('ls', ['-1', '/Library/Audio/Plug-Ins/HAL']),
      safeRun('pkgutil', ['--pkgs'])
    ]);

    const voiceList = sayVoices.ok ? parseLines(sayVoices.stdout) : [];
    const sayAudioList = sayAudioDevices.ok ? parseLines(sayAudioDevices.stdout) : [];
    const switchOutputList = switchOutputs.ok ? parseLines(switchOutputs.stdout) : [];
    const halEntries = blackHoleFiles.ok ? parseLines(blackHoleFiles.stdout) : [];
    const packageEntries = blackHolePackages.ok ? parseLines(blackHolePackages.stdout) : [];

    const blackHoleInHal = halEntries.filter((entry) => entry.toLowerCase().includes('blackhole'));
    const blackHoleInPackages = packageEntries.filter((entry) => entry.toLowerCase().includes('blackhole'));

    return {
      osVersion: os.release(),
      driverName: DEFAULT_DRIVER_NAME,
      voiceCount: voiceList.length,
      sayAudioCount: sayAudioList.length,
      switchOutputCount: switchOutputList.length,
      currentOutput: switchCurrent.stdout || null,
      blackHoleInHal,
      blackHoleInPackages,
      notes: this.buildNotes({
        sayVoices,
        sayAudioDevices,
        switchOutputs,
        switchCurrent,
        voiceList,
        sayAudioList,
        switchOutputList,
        blackHoleInHal,
        blackHoleInPackages
      })
    };
  }

  buildNotes(context) {
    const notes = [];

    if (!context.sayVoices.ok) {
      notes.push(`say voices check failed: ${context.sayVoices.stderr || 'unknown error'}`);
    } else if (context.voiceList.length === 0) {
      notes.push('say returned zero voices in this shell.');
    }

    if (!context.sayAudioDevices.ok) {
      notes.push(`say audio-device check failed: ${context.sayAudioDevices.stderr || 'unknown error'}`);
    } else if (context.sayAudioList.length === 0) {
      notes.push('say returned zero visible audio devices.');
    }

    if (!context.switchOutputs.ok) {
      notes.push(`SwitchAudioSource output listing failed: ${context.switchOutputs.stderr || 'unknown error'}`);
    } else if (context.switchOutputList.length === 0) {
      notes.push('SwitchAudioSource returned zero output devices.');
    }

    if (context.switchCurrent.ok && !context.switchCurrent.stdout) {
      notes.push('SwitchAudioSource did not report a current output device.');
    }

    if (context.blackHoleInHal.length === 0 && context.blackHoleInPackages.length === 0) {
      notes.push('BlackHole was not found in /Library/Audio/Plug-Ins/HAL or pkgutil package records.');
    } else if (context.blackHoleInHal.length === 0) {
      notes.push('BlackHole appears in package records but not in /Library/Audio/Plug-Ins/HAL.');
    }

    if (context.sayAudioList.length === 0 && context.switchOutputList.length === 0) {
      notes.push('BlackHole is not visible to macOS audio APIs yet. Install the driver and restart until it appears.');
    }

    return notes;
  }
}

module.exports = {
  Doctor
};
