const fs = require('fs');
const path = require('path');

function resolveWindowsHelperPath() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'native', 'windows-helper', 'AFAWindowsAudioHelper.exe') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'resources', 'native', 'windows-helper', 'AFAWindowsAudioHelper.exe') : null,
    path.join(process.cwd(), 'resources', 'native', 'windows-helper', 'AFAWindowsAudioHelper.exe')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

module.exports = {
  resolveWindowsHelperPath
};
