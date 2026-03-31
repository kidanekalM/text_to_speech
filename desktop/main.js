const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, screen } = require('electron');
const { AfaController } = require('../lib/afa-controller');

const WINDOW_SIZES = {
  compact: { width: 280, height: 170 },
  expanded: { width: 280, height: 384 }
};

const WINDOW_MARGIN = 18;

let mainWindow = null;
let tray = null;
const controller = new AfaController({
  config: {
    routingMode: 'system',
    output: null,
    speechOutput: null,
    startupWarning: null
  }
});

function resolveAppIconPath() {
  const candidates = [
    path.join(process.cwd(), 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function getAppIcon() {
  const iconPath = resolveAppIconPath();
  const image = nativeImage.createFromPath(iconPath);

  return image.isEmpty() ? null : image;
}

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
  const appIcon = getAppIcon();

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
    icon: appIcon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  applyStickyWindowBehavior();
  if (process.platform === 'darwin' && typeof mainWindow.setHiddenInMissionControl === 'function') {
    mainWindow.setHiddenInMissionControl(true);
  }
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('focus', () => {
    applyStickyWindowBehavior();
  });

  mainWindow.on('blur', () => {
    if (!mainWindow) {
      return;
    }

    applyStickyWindowBehavior();
    mainWindow.moveTop();
  });

  mainWindow.on('show', () => {
    applyStickyWindowBehavior();
    mainWindow.moveTop();
  });

  mainWindow.on('restore', () => {
    applyStickyWindowBehavior();
    mainWindow.moveTop();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function revealWindow() {
  if (!mainWindow) {
    createWindow();
  }

  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  applyStickyWindowBehavior();
  mainWindow.moveTop();
  mainWindow.focus();
}

function createTray() {
  const appIcon = getAppIcon();

  if (!appIcon) {
    return;
  }

  tray = new Tray(appIcon.resize({ width: 18, height: 18 }));
  tray.setToolTip('AFA');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show AFA',
      click: () => revealWindow()
    },
    {
      label: 'Quit',
      click: async () => {
        await controller.shutdown();
        app.quit();
      }
    }
  ]));
  tray.on('click', () => revealWindow());
}

function applyStickyWindowBehavior() {
  if (!mainWindow) {
    return;
  }

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  });
}

async function bootstrap() {
  await controller.initialize({
    mode: 'system'
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
  createTray();
  createWindow();

  screen.on('display-metrics-changed', () => {
    resizeWindow('compact');

    if (mainWindow) {
      applyStickyWindowBehavior();
      mainWindow.moveTop();
    }
  });

  screen.on('display-added', () => {
    if (mainWindow) {
      applyStickyWindowBehavior();
      mainWindow.moveTop();
    }
  });

  screen.on('display-removed', () => {
    if (mainWindow) {
      applyStickyWindowBehavior();
      mainWindow.moveTop();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      revealWindow();
      return;
    }

    revealWindow();
  });
}).catch((error) => {
  console.error('Electron startup failed:', error);
  app.quit();
});

app.on('window-all-closed', async () => {
  await controller.shutdown();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('afa:get-status', async () => controller.getStatus());
ipcMain.handle('afa:list-voices', async () => controller.listVoices());
ipcMain.handle('afa:list-outputs', async () => controller.listOutputs());
ipcMain.handle('afa:doctor', async () => controller.inspect());
ipcMain.handle('afa:driver-state', async () => controller.getDriverState());
ipcMain.handle('afa:audio-safety', async () => controller.getAudioSafety());
ipcMain.handle('afa:install-driver', async () => controller.installDriver());
ipcMain.handle('afa:setup-steps', async () => controller.getSetupSteps());
ipcMain.handle('afa:speak', async (_event, text) => controller.speak(text));
ipcMain.handle('afa:restore-normal-audio', async () => controller.restoreNormalAudio());
ipcMain.handle('afa:test-speaker', async () => controller.testSpeaker());
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
  await controller.shutdown();
  app.quit();
  return true;
});
