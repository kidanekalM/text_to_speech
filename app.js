#!/usr/bin/env node

const { InputHandler } = require('./lib/input-handler');
const { AfaController, DEFAULT_LOOPBACK_DEVICE, buildDefaultConfig } = require('./lib/afa-controller');

function printHelp() {
  console.log('Usage: node app.js [options]');
  console.log('');
  console.log('Options:');
  console.log('--voice NAME         Set startup voice');
  console.log('--rate NUMBER        Set startup speech rate');
  console.log('--mode MODE          Routing mode: system or device');
  console.log('--output DEVICE      Target device when using device mode');
  console.log(`                      Default virtual mic device: "${DEFAULT_LOOPBACK_DEVICE}"`);
  console.log('--list-voices        List available voices and exit');
  console.log('--list-outputs       List available output devices and exit');
  console.log('--doctor             Inspect voices, audio devices, and virtual-driver readiness');
  console.log('--setup              Show the current platform setup steps');
  console.log('--help               Show this help');
  console.log('');
  console.log('Interactive commands:');
  console.log('/voice Alex');
  console.log('/voice default');
  console.log('/rate 200');
  console.log('/mode system');
  console.log('/mode device');
  console.log(`/output ${DEFAULT_LOOPBACK_DEVICE}`);
  console.log('/setup');
  console.log('/doctor');
  console.log('/status');
  console.log('/exit');
}

function parseArgs(argv) {
  const defaults = buildDefaultConfig();
  const options = {
    voice: defaults.voice,
    rate: defaults.rate,
    mode: defaults.routingMode,
    output: defaults.output,
    listVoices: false,
    listOutputs: false,
    doctor: false,
    setup: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--voice':
        if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
          throw new Error('A voice name is required after --voice.');
        }
        options.voice = argv[index + 1];
        index += 1;
        break;
      case '--rate':
        if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
          throw new Error('A numeric rate is required after --rate.');
        }
        options.rate = Number.parseInt(argv[index + 1], 10);
        index += 1;
        break;
      case '--output':
        if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
          throw new Error('An output device name is required after --output.');
        }
        options.output = argv[index + 1];
        index += 1;
        break;
      case '--mode':
        if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
          throw new Error('A mode is required after --mode.');
        }
        options.mode = argv[index + 1].trim().toLowerCase();
        index += 1;
        break;
      case '--list-voices':
        options.listVoices = true;
        break;
      case '--list-outputs':
        options.listOutputs = true;
        break;
      case '--doctor':
        options.doctor = true;
        break;
      case '--setup':
        options.setup = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.rate) || options.rate < 50 || options.rate > 600) {
    throw new Error('Startup rate must be a number between 50 and 600.');
  }

  if (!['system', 'device'].includes(options.mode)) {
    throw new Error('Mode must be either "system" or "device".');
  }

  return options;
}

async function printList(title, values) {
  if (values.length === 0) {
    console.log(`${title}: none returned on this machine.`);
    return;
  }

  console.log(`${title}:`);
  values.forEach((value) => console.log(`- ${value}`));
}

async function printDoctorReport(report) {
  console.log('AFA doctor');
  console.log(`Kernel: ${report.osVersion}`);
  console.log(`Driver: ${report.driverName}`);
  console.log(`Voices visible to the speech engine: ${report.voiceCount}`);
  console.log(`Visible audio outputs: ${report.audioDeviceCount || report.sayAudioCount}`);
  console.log(`Visible switchable outputs: ${report.switchOutputCount}`);
  console.log(`Current output: ${report.currentOutput || 'not reported'}`);

  if (Array.isArray(report.cableDevices)) {
    console.log(`Virtual devices: ${report.cableDevices.length > 0 ? report.cableDevices.join(', ') : 'none'}`);
  }

  if (Array.isArray(report.blackHoleInHal) && Array.isArray(report.blackHoleInPackages)) {
    console.log(`Driver file matches: ${report.blackHoleInHal.length > 0 ? report.blackHoleInHal.join(', ') : 'none'}`);
    console.log(`Driver package matches: ${report.blackHoleInPackages.length > 0 ? report.blackHoleInPackages.join(', ') : 'none'}`);
  }

  if (report.notes.length === 0) {
    console.log('No obvious issues detected.');
    return;
  }

  console.log('Notes:');
  report.notes.forEach((note) => console.log(`- ${note}`));
}

function printSetup(steps) {
  console.log('AFA setup');
  steps.forEach((step, index) => console.log(`${index + 1}. ${step}`));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const controller = new AfaController();

  if (options.help) {
    printHelp();
    return;
  }

  if (options.listVoices) {
    const voices = await controller.listVoices();
    await printList('Available voices', voices);
    return;
  }

  if (options.listOutputs) {
    const outputs = await controller.listOutputs();
    await printList('Available output devices', outputs);
    return;
  }

  if (options.doctor) {
    const report = await controller.inspect();
    await printDoctorReport(report);
    return;
  }

  if (options.setup) {
    printSetup(controller.getSetupSteps());
    return;
  }

  await controller.initialize({
    voice: options.voice,
    rate: options.rate,
    mode: options.mode,
    output: options.mode === 'device' ? options.output : null
  });

  const inputHandler = new InputHandler({
    controller
  });

  await inputHandler.start();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
