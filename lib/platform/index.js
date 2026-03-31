const { Speech } = require('../speech');
const { AudioRouting } = require('../audio-routing');
const { Doctor } = require('../doctor');
const { DriverManager, DEFAULT_DRIVER_NAME, DEFAULT_VIRTUAL_DEVICE } = require('../driver-manager');
const { WindowsSpeech } = require('../windows/speech');
const { WindowsAudioRouting } = require('../windows/audio-routing');
const { WindowsDoctor } = require('../windows/doctor');
const {
  WindowsDriverManager,
  WINDOWS_DRIVER_NAME,
  WINDOWS_VIRTUAL_DEVICE,
  WINDOWS_LISTENER_DEVICE
} = require('../windows/driver-manager');
const { LinuxSpeech } = require('../linux/speech');
const { LinuxAudioRouting } = require('../linux/audio-routing');
const { LinuxDoctor } = require('../linux/doctor');
const {
  LinuxDriverManager,
  LINUX_DRIVER_NAME,
  LINUX_VIRTUAL_DEVICE,
  LINUX_LISTENER_DEVICE,
  LINUX_VIRTUAL_DEVICE_LABEL,
  LINUX_LISTENER_LABEL
} = require('../linux/driver-manager');

function createPlatformServices(platform = process.platform) {
  if (platform === 'win32') {
    return {
      platform,
      speech: new WindowsSpeech(),
      audioRouting: new WindowsAudioRouting(),
      doctor: new WindowsDoctor(),
      driverManager: new WindowsDriverManager(),
      driverName: WINDOWS_DRIVER_NAME,
      defaultVirtualDevice: WINDOWS_VIRTUAL_DEVICE,
      listenerDevice: WINDOWS_LISTENER_DEVICE,
      setupSteps: [
        'Install the bundled VB-CABLE driver when AFA asks for it.',
        'Restart Windows if AFA says the virtual cable is installed but not visible yet.',
        `Set the Windows default playback device to "${WINDOWS_VIRTUAL_DEVICE}".`,
        `In Zoom or another listener app, set the microphone to "${WINDOWS_LISTENER_DEVICE}".`
      ]
    };
  }

  if (platform === 'linux') {
    return {
      platform,
      speech: new LinuxSpeech(),
      audioRouting: new LinuxAudioRouting(),
      doctor: new LinuxDoctor(),
      driverManager: new LinuxDriverManager(),
      driverName: LINUX_DRIVER_NAME,
      defaultVirtualDevice: LINUX_VIRTUAL_DEVICE,
      listenerDevice: LINUX_LISTENER_DEVICE,
      setupSteps: [
        'AFA creates a PipeWire/PulseAudio virtual sink and mic on demand.',
        `AFA routes speech to "${LINUX_VIRTUAL_DEVICE_LABEL}".`,
        `In Zoom or another listener app, set the microphone to "${LINUX_LISTENER_LABEL}".`,
        'If setup fails, install PipeWire or PulseAudio user tools that provide pactl plus a Linux TTS engine such as espeak-ng.'
      ]
    };
  }

  return {
    platform,
    speech: new Speech(),
    audioRouting: new AudioRouting(),
    doctor: new Doctor(),
    driverManager: new DriverManager(),
    driverName: DEFAULT_DRIVER_NAME,
    defaultVirtualDevice: DEFAULT_VIRTUAL_DEVICE,
    listenerDevice: DEFAULT_VIRTUAL_DEVICE,
    setupSteps: [
      'Install the bundled BlackHole driver when AFA asks for it.',
      'Restart macOS if AFA says the driver is installed but not visible yet.',
      `AFA will target "${DEFAULT_VIRTUAL_DEVICE}" automatically.`,
      `In Zoom or another listener app, set the microphone to "${DEFAULT_VIRTUAL_DEVICE}".`
    ]
  };
}

function getDefaultVirtualDevice(platform = process.platform) {
  return createPlatformServices(platform).defaultVirtualDevice;
}

module.exports = {
  createPlatformServices,
  getDefaultVirtualDevice
};
