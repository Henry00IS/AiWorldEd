const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_SCHEME = 'app';
const DEFAULT_WINDOW_WIDTH = 1400;
const DEFAULT_WINDOW_HEIGHT = 900;

/**
 * Resolves the directory that holds the Vite web build output.
 * @returns {string} Absolute path to the docs folder.
 */
function resolveWebBuildDirectory() {
  return path.join(__dirname, '..', 'docs');
}

/**
 * Maps an app:// request URL to a file path under the web build directory.
 * @param {string} requestUrl Full request URL from the custom protocol.
 * @returns {string} Absolute filesystem path for the requested asset.
 */
function resolveRequestToFilePath(requestUrl) {
  const parsedUrl = new URL(requestUrl);
  const decodedPathname = decodeURIComponent(parsedUrl.pathname);
  const relativePath = decodedPathname === '/' ? 'index.html' : decodedPathname.replace(/^\//, '');
  const webBuildDirectory = resolveWebBuildDirectory();
  return path.normalize(path.join(webBuildDirectory, relativePath));
}

/**
 * Registers the privileged custom scheme used as a secure local origin.
 */
function registerPrivilegedAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Handles app:// requests by serving files from the Vite build output.
 */
function registerAppProtocolHandler() {
  protocol.handle(APP_SCHEME, (request) => {
    const filePath = resolveRequestToFilePath(request.url);
    return net.fetch(pathToFileURL(filePath).href);
  });
}

/**
 * Creates the main editor browser window and loads the packaged web app.
 * @returns {BrowserWindow} The created window instance.
 */
function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1d1d1d',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(`${APP_SCHEME}://./index.html`);
  return mainWindow;
}

/**
 * Wires application lifecycle events for window creation and quit behavior.
 */
function bindApplicationLifecycle() {
  app.whenReady().then(() => {
    registerAppProtocolHandler();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

registerPrivilegedAppScheme();
bindApplicationLifecycle();
