const { runCommand } = require('../command-runner');

function parseLines(raw) {
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function findBestMatch(values, target) {
  const normalizedTarget = String(target || '').trim().toLowerCase();

  if (!normalizedTarget) {
    return null;
  }

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

function shellEscape(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

async function safeRun(command, args, options = {}) {
  try {
    const result = await runCommand(command, args, options);
    return {
      ok: result.code === 0,
      code: result.code,
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim()
    };
  } catch (error) {
    return {
      ok: false,
      code: -1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

async function commandExists(command) {
  const result = await safeRun('bash', ['-lc', `command -v ${shellEscape(command)}`]);
  return result.ok && Boolean(result.stdout);
}

async function detectFirstAvailable(commands) {
  for (const command of commands) {
    // eslint-disable-next-line no-await-in-loop
    if (await commandExists(command)) {
      return command;
    }
  }

  return null;
}

function parsePactlShortEntries(raw) {
  return parseLines(raw).map((line) => {
    const parts = line.split('\t');

    return {
      id: parts[0] || '',
      name: parts[1] || '',
      driver: parts[2] || '',
      sampleSpec: parts[3] || '',
      state: parts[4] || ''
    };
  });
}

async function listPactlEntries(kind) {
  const result = await safeRun('pactl', ['list', 'short', kind]);

  if (!result.ok) {
    throw new Error(result.stderr || `Failed to list Linux ${kind}.`);
  }

  return parsePactlShortEntries(result.stdout);
}

async function listWpctlEntries(sectionName) {
  const result = await safeRun('wpctl', ['status']);

  if (!result.ok) {
    throw new Error(result.stderr || 'Failed to inspect PipeWire status.');
  }

  const lines = String(result.stdout || '').split('\n');
  const sectionHeader = `${sectionName}:`;
  const entries = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u001b\[[0-9;]*m/g, '');
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (!inSection) {
      if (trimmed === sectionHeader) {
        inSection = true;
      }
      continue;
    }

    if (/^[A-Za-z].+:$/.test(trimmed)) {
      break;
    }

    const match = trimmed.match(/^(?:\*\s+)?(\d+)\.\s+(.+?)(?:\s+\[vol:.*\])?$/);

    if (!match) {
      continue;
    }

    entries.push({
      id: match[1],
      name: match[2].trim(),
      isDefault: trimmed.startsWith('*')
    });
  }

  return entries;
}

async function listOutputDevices() {
  if (await commandExists('pactl')) {
    const entries = await listPactlEntries('sinks');
    return entries.map((entry) => entry.name).filter(Boolean);
  }

  if (await commandExists('wpctl')) {
    const entries = await listWpctlEntries('Sinks');
    return entries.map((entry) => entry.name).filter(Boolean);
  }

  return [];
}

async function listInputDevices() {
  if (await commandExists('pactl')) {
    const entries = await listPactlEntries('sources');
    return entries.map((entry) => entry.name).filter(Boolean);
  }

  if (await commandExists('wpctl')) {
    const entries = await listWpctlEntries('Sources');
    return entries.map((entry) => entry.name).filter(Boolean);
  }

  return [];
}

async function getDefaultOutputDevice() {
  if (await commandExists('pactl')) {
    const direct = await safeRun('pactl', ['get-default-sink']);

    if (direct.ok && direct.stdout) {
      return direct.stdout;
    }

    const info = await safeRun('pactl', ['info']);

    if (info.ok) {
      const line = parseLines(info.stdout).find((entry) => entry.toLowerCase().startsWith('default sink:'));
      if (line) {
        return line.split(':').slice(1).join(':').trim();
      }
    }
  }

  if (await commandExists('wpctl')) {
    const entries = await listWpctlEntries('Sinks');
    const current = entries.find((entry) => entry.isDefault);
    return current ? current.name : '';
  }

  return '';
}

module.exports = {
  parseLines,
  findBestMatch,
  shellEscape,
  safeRun,
  commandExists,
  detectFirstAvailable,
  listPactlEntries,
  listOutputDevices,
  listInputDevices,
  getDefaultOutputDevice
};
