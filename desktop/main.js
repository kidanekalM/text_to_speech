const path = require('path');
const { app, BrowserWindow, ipcMain, nativeTheme, screen } = require('electron');
const { AfaController, DEFAULT_LOOPBACK_DEVICE } = require('../lib/afa-controller');

const WINDOW_SIZES = {
  compact: { width: 280, height: 158 },
  expanded: { width: 280, height: 344 }
};

const WINDOW_MARGIN = 18;

let mainWindow = null;
const controller = new AfaController({
  config: {
    routingMode: 'device',
    output: DEFAULT_LOOPBACK_DEVICE,
    speechOutput: DEFAULT_LOOPBACK_DEVICE,
    startupWarning: 'AFA is waiting for the BlackHole virtual mic to become available.'
  }
});

function getPinnedBounds(size) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;

  return {
    width: size.width,
    height: size.height,
    x: Math.round(workArea.x + workArea.width - size.width - WINDOW_MARGIN),
    y: Math.round(workArea.y + workArea.height - size.height - WINDOW_MARGIN)
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...getPinnedBounds(WINDOW_SIZES.compact),
    frame: false,
    titleBarStyle: 'hidden',
    transparent: true,
    resizable: false,
    fullscreenable: false,
    movable: true,
    vibrancy: 'hud',
    visualEffectState: 'active',
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  applyStickyWindowBehavior();
  mainWindow.setHiddenInMissionControl(true);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('blur', () => {
    if (!mainWindow) {
      return;
    }

    applyStickyWindowBehavior();
    mainWindow.moveTop();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function applyStickyWindowBehavior() {
  if (!mainWindow) {
    return;
  }

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

async function bootstrap() {
  await controller.initialize({
    mode: 'device',
    output: DEFAULT_LOOPBACK_DEVICE
  });
}

function resizeWindow(mode) {
  if (!mainWindow) {
    return;
  }

  const size = mode === 'expanded' ? WINDOW_SIZES.expanded : WINDOW_SIZES.compact;
  mainWindow.setBounds(getPinnedBounds(size), true);
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'light';
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
  await bootstrap();
  createWindow();

  screen.on('display-metrics-changed', () => {
    resizeWindow('compact');

    if (mainWindow) {
      applyStickyWindowBehavior();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await controller.stop();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('afa:get-status', async () => controller.getStatus());
ipcMain.handle('afa:list-voices', async () => controller.listVoices());
ipcMain.handle('afa:list-outputs', async () => controller.listOutputs());
ipcMain.handle('afa:doctor', async () => controller.inspect());
ipcMain.handle('afa:driver-state', async () => controller.getDriverState());
ipcMain.handle('afa:install-driver', async () => controller.installDriver());
ipcMain.handle('afa:setup-steps', async () => controller.getSetupSteps());
ipcMain.handle('afa:speak', async (_event, text) => controller.speak(text));
ipcMain.handle('afa:set-voice', async (_event, value) => controller.setVoice(value));
ipcMain.handle('afa:set-rate', async (_event, value) => controller.setRate(value));
ipcMain.handle('afa:set-mode', async (_event, value) => controller.setMode(value));
ipcMain.handle('afa:set-output', async (_event, value) => controller.setOutput(value));
ipcMain.handle('afa:resize', async (_event, mode) => {
  resizeWindow(mode);
  return true;
});
ipcMain.handle('afa:minimize', async () => {
  if (mainWindow) {
    mainWindow.minimize();
  }

  return true;
});
ipcMain.handle('afa:close', async () => {
  await controller.stop();
  app.quit();
  return true;
});
