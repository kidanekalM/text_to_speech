const os = require('os');
const {
  commandExists,
  detectFirstAvailable,
  listOutputDevices,
  listInputDevices,
  getDefaultOutputDevice
} = require('./common');
const {
  LINUX_DRIVER_NAME,
  LINUX_VIRTUAL_DEVICE,
  LINUX_LISTENER_DEVICE
} = require('./driver-manager');
const { LinuxSpeech } = require('./speech');

class LinuxDoctor {
  async inspect() {
    const speech = new LinuxSpeech();
    const [hasPactl, ttsEngine, playbackEngine, voices, outputs, inputs, currentOutput] = await Promise.all([
      commandExists('pactl'),
      detectFirstAvailable(['espeak-ng', 'espeak', 'spd-say']),
      detectFirstAvailable(['pw-play', 'paplay']),
      speech.listVoices().catch(() => []),
      listOutputDevices().catch(() => []),
      listInputDevices().catch(() => []),
      getDefaultOutputDevice().catch(() => '')
    ]);

    const notes = [];

    if (!ttsEngine) {
      notes.push('Linux speech requires espeak-ng, espeak, or spd-say.');
    }

    if (!playbackEngine) {
      notes.push('Direct Linux routing to the virtual sink requires pw-play or paplay.');
    }

    if (!hasPactl) {
      notes.push('Linux routing requires pactl from PipeWire or PulseAudio.');
    }

    if (outputs.length === 0) {
      notes.push('No Linux output devices were returned.');
    }

    if (!outputs.includes(LINUX_VIRTUAL_DEVICE)) {
      notes.push('AFA Virtual Sink is not created yet.');
    }

    if (!inputs.includes(LINUX_LISTENER_DEVICE)) {
      notes.push('AFA Virtual Mic is not created yet.');
    }

    return {
      osVersion: os.release(),
      driverName: LINUX_DRIVER_NAME,
      voiceCount: voices.length,
      audioDeviceCount: outputs.length,
      cableDevices: [
        ...outputs.filter((entry) => entry.includes(LINUX_VIRTUAL_DEVICE)),
        ...inputs.filter((entry) => entry.includes(LINUX_LISTENER_DEVICE))
      ],
      sayAudioCount: outputs.length,
      switchOutputCount: outputs.length,
      currentOutput: currentOutput || null,
      blackHoleInHal: [],
      blackHoleInPackages: [],
      notes
    };
  }
}

module.exports = {
  LinuxDoctor
};
