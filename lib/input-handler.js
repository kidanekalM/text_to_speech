const readline = require('readline');

class InputHandler {
  constructor({ controller }) {
    this.controller = controller;
    this.readline = null;
    this.shouldExit = false;
  }

  async start() {
    const banner = await this.buildBanner();

    this.readline = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });

    this.printBanner(banner);
    this.readline.prompt();

    process.on('SIGINT', async () => {
      if (this.readline) {
        this.shouldExit = true;
        this.readline.close();
      }
    });

    try {
      for await (const line of this.readline) {
        try {
          await this.handleLine(line);
        } catch (error) {
          this.printError(error);
        }

        if (this.shouldExit) {
          break;
        }

        this.readline.prompt();
      }
    } finally {
      await this.controller.stop();
      process.stdout.write('\n');
    }
  }

  async buildBanner() {
    const status = await this.controller.getStatus();

    return {
      status
    };
  }

  printBanner({ status }) {
    console.log('macOS Text-to-Speech Virtual Mic');
    console.log(`Voice: ${status.voice || 'System default'}`);
    console.log(`Rate: ${status.rate} wpm`);
    console.log(`Output: ${status.output || 'System default'}`);
    console.log(`Routing: ${this.describeRoutingMode(status.routingMode)}`);

    if (status.startupWarning) {
      console.log(`Note: ${status.startupWarning}`);

      if (status.routingMode === 'direct-say') {
        console.log(`Note: Falling back to direct say output targeting for "${status.output}".`);
      }

      if (status.routingMode === 'deferred-output') {
        console.log('Note: The output target is saved, but macOS is not exposing that device to this shell yet.');
      }
    }

    console.log(
      'Commands: /voice NAME, /voice default, /rate NUMBER, /mode system|device, /output DEVICE, /setup, /voices, /outputs, /doctor, /status, /exit'
    );
    console.log('Type any text and press Enter to speak it.');
  }

  async handleLine(line) {
    const trimmed = String(line || '').trim();

    if (!trimmed) {
      return;
    }

    if (!trimmed.startsWith('/')) {
      await this.controller.speak(trimmed);
      return;
    }

    const commandMatch = trimmed.match(/^\/(\S+)(?:\s+([\s\S]+))?$/);

    if (!commandMatch) {
      console.log('Invalid command. Use /help to see the available commands.');
      return;
    }

    const command = commandMatch[1].toLowerCase();
    const value = commandMatch[2] ? commandMatch[2].trim() : '';

    switch (command) {
      case 'voice':
        await this.controller.setVoice(value);
        console.log(`Voice: ${(await this.controller.getStatus()).voice || 'System default'}`);
        return;
      case 'rate':
        this.controller.setRate(value);
        console.log(`Rate set to ${this.controller.getState().rate} wpm`);
        return;
      case 'mode':
        this.controller.setMode(value);
        console.log(`Routing mode set to ${this.controller.getState().routingMode}.`);
        return;
      case 'output':
        await this.controller.setOutput(value);
        console.log(`Output: ${(await this.controller.getStatus()).output}`);
        return;
      case 'voices':
        await this.printVoices();
        return;
      case 'outputs':
        await this.printOutputs();
        return;
      case 'setup':
        this.printSetup();
        return;
      case 'doctor':
        await this.printDoctor();
        return;
      case 'status':
        await this.printStatus();
        return;
      case 'help':
        this.printHelp();
        return;
      case 'exit':
      case 'quit':
        this.shouldExit = true;
        this.readline.close();
        return;
      default:
        console.log(`Unknown command: /${command}`);
        this.printHelp();
    }
  }

  async printVoices() {
    const voices = await this.controller.listVoices();

    if (voices.length === 0) {
      console.log('No voices were returned by macOS on this machine.');
      return;
    }

    console.log('Available voices:');
    voices.forEach((voice) => console.log(`- ${voice}`));
  }

  async printOutputs() {
    const outputs = await this.controller.listOutputs();

    if (outputs.length === 0) {
      console.log('No output devices were returned by SwitchAudioSource.');
      return;
    }

    console.log('Available output devices:');
    outputs.forEach((output) => console.log(`- ${output}`));
  }

  async printStatus() {
    const status = await this.controller.getStatus();
    console.log(`Voice: ${status.voice || 'System default'}`);
    console.log(`Rate: ${status.rate} wpm`);
    console.log(`Output: ${status.output || 'System default'}`);
    console.log(`Routing: ${this.describeRoutingMode(status.routingMode)}`);
  }

  async printDoctor() {
    const report = await this.controller.inspect();
    console.log(`Kernel: ${report.osVersion}`);
    console.log(`Driver: ${report.driverName}`);
    console.log(`Voices visible to say: ${report.voiceCount}`);
    console.log(`Audio devices visible to say: ${report.sayAudioCount}`);
    console.log(`Output devices visible to SwitchAudioSource: ${report.switchOutputCount}`);
    console.log(`Current output: ${report.currentOutput || 'not reported'}`);
    console.log(`Driver file matches: ${report.blackHoleInHal.length > 0 ? report.blackHoleInHal.join(', ') : 'none'}`);
    console.log(`Driver package matches: ${report.blackHoleInPackages.length > 0 ? report.blackHoleInPackages.join(', ') : 'none'}`);

    if (report.notes.length > 0) {
      console.log('Notes:');
      report.notes.forEach((note) => console.log(`- ${note}`));
    }
  }

  printHelp() {
    console.log('Commands:');
    console.log('/voice NAME      Set the macOS voice');
    console.log('/voice default   Reset to the system default voice');
    console.log('/rate NUMBER     Set speaking rate in words per minute');
    console.log('/mode system     Use the current macOS output device');
    console.log('/mode device     Route to a specific device with /output');
    console.log('/output DEVICE   Try SwitchAudioSource first, then fall back to say -a DEVICE');
    console.log('/setup           Show the current platform setup and readiness steps');
    console.log('/voices          List available macOS voices');
    console.log('/outputs         List available output devices');
    console.log('/doctor          Inspect audio visibility and virtual-driver state');
    console.log('/status          Show the current settings');
    console.log('/exit            Quit the application');
  }

  printSetup() {
    console.log('AFA setup:');
    this.controller.getSetupSteps().forEach((step, index) => {
      console.log(`${index + 1}. ${step}`);
    });
  }

  describeRoutingMode(mode) {
    switch (mode) {
      case 'system':
        return 'System output mode; ideal for the current macOS output device';
      case 'device':
        return 'Device mode; select a target with /output';
      case 'system-switched':
        return 'System output switched with SwitchAudioSource';
      case 'direct-say':
        return 'Direct speech routing with say -a';
      case 'deferred-output':
        return 'Deferred output target; macOS device not currently discoverable';
      default:
        return 'System default output';
    }
  }

  printError(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
  }
}

module.exports = {
  InputHandler
};
