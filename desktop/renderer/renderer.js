const shell = document.getElementById('shell');
const closeBtn = document.getElementById('closeBtn');
const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
const speakBtn = document.getElementById('speakBtn');
const clearBtn = document.getElementById('clearBtn');
const retryDriverBtn = document.getElementById('retryDriverBtn');
const installDriverBtn = document.getElementById('installDriverBtn');
const restoreAudioBtn = document.getElementById('restoreAudioBtn');
const testSpeakerBtn = document.getElementById('testSpeakerBtn');
const setupBtn = document.getElementById('setupBtn');
const doctorBtn = document.getElementById('doctorBtn');
const saveRouteBtn = document.getElementById('saveRouteBtn');
const refreshBtn = document.getElementById('refreshBtn');
const textInput = document.getElementById('textInput');
const voiceSelect = document.getElementById('voiceSelect');
const rateInput = document.getElementById('rateInput');
const modeSelect = document.getElementById('modeSelect');
const outputInput = document.getElementById('outputInput');
const driverHeadline = document.getElementById('driverHeadline');
const driverDetail = document.getElementById('driverDetail');
const statusDot = document.getElementById('statusDot');
const statusLine = document.getElementById('statusLine');
const messageBox = document.getElementById('messageBox');
const settingsPanel = document.getElementById('settingsPanel');

let settingsOpen = false;

function setMessage(text) {
  messageBox.textContent = text;
}

function setCompactMode(open) {
  settingsOpen = open;
  settingsPanel.classList.toggle('hidden', !open);
  shell.classList.toggle('compact', !open);
  shell.classList.toggle('expanded', open);
  toggleSettingsBtn.textContent = open ? '×' : '•••';
  window.afa.resize(open ? 'expanded' : 'compact');
}

function setStatus(state) {
  const outputLabel = state.routingMode === 'system'
    ? 'System speaker'
    : state.output || 'BlackHole 2ch';

  statusLine.textContent = `${outputLabel} | ${state.voice || 'System voice'}`;
  rateInput.value = state.rate;
  modeSelect.value = state.routingMode === 'system' ? 'system' : 'device';
  outputInput.value = state.output || 'BlackHole 2ch';

  if (!voiceSelect.dataset.loaded) {
    return;
  }

  const currentVoice = state.voice || '';
  voiceSelect.value = [...voiceSelect.options].some((option) => option.value === currentVoice) ? currentVoice : '';
}

async function refreshStatus() {
  const state = await window.afa.getStatus();
  setStatus(state);

  if (state.startupWarning) {
    setMessage(state.startupWarning);
  } else if (!messageBox.textContent.trim()) {
    setMessage('Speaker-safe mode is active.');
  }
}

async function refreshAudioSafety() {
  try {
    const safety = await window.afa.getAudioSafety();

    restoreAudioBtn.disabled = !safety.canRestore;
    testSpeakerBtn.disabled = false;

    if (safety.virtualOutputActive) {
      setMessage(`Audio is currently on ${safety.currentOutput}. Use "Normal Audio" to restore ${safety.restoreTarget || 'your real speakers'}.`);
    }
  } catch (error) {
    restoreAudioBtn.disabled = false;
    testSpeakerBtn.disabled = false;
  }
}

async function refreshDriverState() {
  const driverState = await window.afa.getDriverState();
  statusDot.classList.remove('ready', 'blocked');

  if (driverState.ready) {
    statusDot.classList.add('ready');
    driverHeadline.textContent = 'BlackHole ready';
    driverDetail.textContent = 'AFA can now speak into the virtual mic.';
    installDriverBtn.disabled = true;
    installDriverBtn.textContent = 'Installed';
    return driverState;
  }

  statusDot.classList.add('blocked');

  if (driverState.restartRequired) {
    driverHeadline.textContent = 'Restart required';
    driverDetail.textContent = 'BlackHole is installed. Restart macOS, then reopen AFA.';
    installDriverBtn.disabled = true;
    installDriverBtn.textContent = 'Installed';
    return driverState;
  }

  if (driverState.installed) {
    driverHeadline.textContent = 'Waiting for virtual mic';
    driverDetail.textContent = 'BlackHole is on disk, but macOS is not exposing the device yet.';
    installDriverBtn.disabled = true;
    installDriverBtn.textContent = 'Installed';
    return driverState;
  }

  driverHeadline.textContent = 'Install virtual mic';
  driverDetail.textContent = driverState.bundledInstallerPresent
    ? 'Install the bundled BlackHole driver from AFA.'
    : 'Bundle BlackHole2ch.pkg inside AFA to enable one-app installation.';
  installDriverBtn.disabled = !driverState.bundledInstallerPresent;
  installDriverBtn.textContent = 'Install Driver';
  return driverState;
}

async function loadVoices() {
  try {
    const voices = await window.afa.listVoices();
    voices.forEach((voice) => {
      const option = document.createElement('option');
      option.value = voice;
      option.textContent = voice;
      voiceSelect.appendChild(option);
    });
    voiceSelect.dataset.loaded = 'true';
  } catch (error) {
    setMessage(`Voice loading failed: ${error.message || String(error)}`);
  }
}

async function runDoctor() {
  try {
    const report = await window.afa.doctor();
    const lines = [
      `Voices visible to say: ${report.voiceCount}`,
      `Audio devices visible to say: ${report.sayAudioCount}`,
      `Output devices visible to SwitchAudioSource: ${report.switchOutputCount}`,
      `BlackHole on disk: ${report.blackHoleInHal.length > 0 ? 'yes' : 'no'}`,
      `BlackHole package registered: ${report.blackHoleInPackages.length > 0 ? 'yes' : 'no'}`
    ];

    if (report.notes.length > 0) {
      lines.push('', ...report.notes.map((note) => `- ${note}`));
    }

    setMessage(lines.join('\n'));
  } catch (error) {
    setMessage(error.message || String(error));
  }
}

async function runSetup() {
  const steps = await window.afa.getSetupSteps();
  setMessage(steps.map((step, index) => `${index + 1}. ${step}`).join('\n'));
}

closeBtn.addEventListener('click', () => window.afa.close());

toggleSettingsBtn.addEventListener('click', () => {
  setCompactMode(!settingsOpen);
});

clearBtn.addEventListener('click', () => {
  textInput.value = '';
  textInput.focus();
});

retryDriverBtn.addEventListener('click', async () => {
  await refreshDriverState();
  await refreshStatus();
  await refreshAudioSafety();
});

installDriverBtn.addEventListener('click', async () => {
  try {
    const result = await window.afa.installDriver();
    setMessage(result.message || 'Install flow finished.');
  } catch (error) {
    setMessage(error.message || String(error));
  } finally {
    await refreshDriverState();
    await refreshAudioSafety();
  }
});

restoreAudioBtn.addEventListener('click', async () => {
  try {
    const state = await window.afa.restoreNormalAudio();
    setMessage(state.startupWarning || 'Restored normal audio.');
    await refreshStatus();
    await refreshAudioSafety();
  } catch (error) {
    setMessage(error.message || String(error));
  }
});

testSpeakerBtn.addEventListener('click', async () => {
  testSpeakerBtn.disabled = true;

  try {
    await window.afa.testSpeaker();
    setMessage('Played speaker test. If you heard it, normal audio is working.');
    await refreshStatus();
    await refreshAudioSafety();
  } catch (error) {
    setMessage(error.message || String(error));
  } finally {
    testSpeakerBtn.disabled = false;
  }
});

setupBtn.addEventListener('click', runSetup);
doctorBtn.addEventListener('click', runDoctor);

speakBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();

  if (!text) {
    setMessage('Type something first.');
    return;
  }

  speakBtn.disabled = true;

  try {
    await window.afa.speak(text);
    setMessage(`Spoke ${text.length} characters.`);
    await refreshStatus();
  } catch (error) {
    setMessage(error.message || String(error));
  } finally {
    speakBtn.disabled = false;
  }
});

textInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    speakBtn.click();
  }
});

voiceSelect.addEventListener('change', async () => {
  try {
    await window.afa.setVoice(voiceSelect.value);
    await refreshStatus();
  } catch (error) {
    setMessage(error.message || String(error));
  }
});

rateInput.addEventListener('change', async () => {
  try {
    await window.afa.setRate(rateInput.value);
    await refreshStatus();
  } catch (error) {
    setMessage(error.message || String(error));
  }
});

modeSelect.addEventListener('change', async () => {
  try {
    await window.afa.setMode(modeSelect.value);
    await refreshStatus();
  } catch (error) {
    setMessage(error.message || String(error));
  }
});

saveRouteBtn.addEventListener('click', async () => {
  try {
    await window.afa.setMode(modeSelect.value);

    if (modeSelect.value === 'device') {
      await window.afa.setOutput(outputInput.value.trim() || 'BlackHole 2ch');
    }

    await refreshStatus();
    await refreshDriverState();
    await refreshAudioSafety();
  } catch (error) {
    setMessage(error.message || String(error));
  }
});

refreshBtn.addEventListener('click', async () => {
  try {
    const outputs = await window.afa.listOutputs();
    const lines = outputs.length > 0 ? outputs.map((output) => `- ${output}`) : ['No output devices returned.'];
    setMessage(lines.join('\n'));
    await refreshStatus();
    await refreshDriverState();
    await refreshAudioSafety();
  } catch (error) {
    setMessage(error.message || String(error));
  }
});

async function init() {
  await loadVoices();
  await refreshDriverState();
  await refreshStatus();
  await refreshAudioSafety();
  textInput.focus();
}

init().catch((error) => {
  setMessage(error.message || String(error));
});
