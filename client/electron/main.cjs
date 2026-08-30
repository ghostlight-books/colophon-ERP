const { app, BrowserWindow } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Check if running in development mode
const isDev = !app.isPackaged;

// Suppress harmless internal Chromium DevTools autofill console notices
if (isDev) {
  app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Colophon',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Only attach preload if the file actually exists to avoid ENOENT errors
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (isDev) {
    // In dev: load Vite's live dev server and open DevTools in a separate window
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production: load the compiled Vite index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});