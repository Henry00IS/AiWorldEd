import { buildDesktopWindowTitle } from '../../application_identity.js';
import type { ElectrobunUpdaterRpcSchema } from '../../updater/electrobun_updater_rpc.js';
import type { StandaloneHostUpdateCheck } from '../../updater/update_types.js';
import { buildDesktopWindowFrame } from '../desktop_window_maximize.js';
import { showMaximizedWhenReady } from '../desktop_window_startup.js';
import { enableWindowsPerMonitorDpiAwareness } from '../windows_dpi_awareness.js';
import { DesktopFullscreenController } from '../desktop_fullscreen_controller.js';

await enableWindowsPerMonitorDpiAwareness();

const { BrowserView, BrowserWindow, Screen, Updater } = await import('electrobun/bun');
let fullscreenController: DesktopFullscreenController;

const updaterRpc = BrowserView.defineRPC<ElectrobunUpdaterRpcSchema>({
  handlers: {
    requests: {
      checkForUpdate: checkForUpdate,
      installUpdate: installUpdate,
      toggleFullscreen: toggleFullscreen,
    },
  },
});

const localInfo = await Updater.getLocalInfo();
const windowTitle = buildDesktopWindowTitle(localInfo.version);
const desktopFrame = buildDesktopWindowFrame(Screen.getPrimaryDisplay().workArea);

const desktopWindow = new BrowserWindow({
  title: windowTitle,
  url: 'views://main_ui/index.html',
  frame: desktopFrame,
  hidden: true,
  activate: false,
  rpc: updaterRpc,
});
fullscreenController = new DesktopFullscreenController(desktopWindow);
showMaximizedWhenReady(desktopWindow);

/** Toggles the native desktop window fullscreen state. */
function toggleFullscreen(): boolean {
  return fullscreenController.toggle();
}

/** Checks Electrobun's configured release channel. */
async function checkForUpdate(): Promise<StandaloneHostUpdateCheck> {
  const current = await Updater.getLocalInfo();
  const latest = await Updater.checkForUpdate();
  const result: StandaloneHostUpdateCheck = {
    currentVersion: current.version,
    latestVersion: latest.version,
    updateAvailable: latest.updateAvailable,
  };
  if (latest.error) result.error = latest.error;
  return result;
}

/** Downloads and applies the update prepared by Electrobun. */
async function installUpdate(): Promise<void> {
  await Updater.downloadUpdate();
  await Updater.applyUpdate();
}
