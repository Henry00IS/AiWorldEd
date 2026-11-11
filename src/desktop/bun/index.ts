import { join } from 'node:path';
import { buildDesktopWindowTitle } from '@/application_identity.js';
import type { ElectrobunDesktopRpcSchema, ElectrobunDesktopWebviewCaller } from '@/ai/shared/mcp_rpc_schema.js';
import { McpHost } from '@/ai/server/mcp_host.js';
import { ElectrobunUpdateHost } from '@/updater/electrobun_update_host.js';
import { buildDesktopWindowFrame } from '@/desktop/desktop_window_maximize.js';
import { showMaximizedWhenReady } from '@/desktop/desktop_window_startup.js';
import { desktopFullscreenToggle } from '@/desktop/fullscreen/desktop_fullscreen_toggle.js';
import { enableWindowsPerMonitorDpiAwareness } from '@/desktop/windows_dpi_awareness.js';
import { applyWindowsWindowIcon } from '@/desktop/windows_window_icon.js';
import { windowsUpdateApply } from '@/desktop/bun/windows_update_apply.js';
import { ProjectDesktopHost } from '@/project/desktop/project_desktop_host.js';

await enableWindowsPerMonitorDpiAwareness();

const { BrowserView, BrowserWindow, Screen, Updater, Utils } = await import('electrobun/bun');

const mcpHost = new McpHost();
const projectHost = new ProjectDesktopHost(`${Utils.paths.userData}/project_folders.json`, pickProjectFolder);
let desktopRpc: ElectrobunDesktopWebviewCaller | null = null;

const desktopRpcBinding = BrowserView.defineRPC<ElectrobunDesktopRpcSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {
      checkForUpdate: () => updateHost.checkForUpdate(),
      downloadUpdate: () => updateHost.downloadUpdate(),
      applyUpdate: () => updateHost.applyUpdate(),
      startMcpServer: startMcpServer,
      stopMcpServer: stopMcpServer,
      getMcpStatus: getMcpStatus,
      projectPick: () => projectHost.pick(),
      projectLast: () => projectHost.last(),
      projectList: (params) => projectHost.list(params),
      projectRead: (params) => projectHost.read(params),
      projectWrite: (params) => projectHost.write(params),
      projectRemove: (params) => projectHost.remove(params),
      windowFullscreenToggle: () => desktopFullscreenToggle(desktopWindow),
    },
  },
});
desktopRpc = desktopRpcBinding as unknown as ElectrobunDesktopWebviewCaller;
const updateHost = new ElectrobunUpdateHost({
  updater: Updater,
  progressSend: (progress) => desktopRpc?.send.updateInstallProgress(progress),
  bundleIsDownloaded: updateBundleIsDownloaded,
  ...(process.platform === 'win32' ? { bundleApply: updateBundleApplyWindows } : {}),
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
  rpc: desktopRpcBinding,
});
showMaximizedWhenReady(desktopWindow, () => applyWindowsWindowIcon(windowTitle));

/**
 * Returns whether Electrobun has fully downloaded the bundle and marked it
 * ready to install.
 *
 * @param hash Hash of the bundle.
 * @returns True when the bundle's tar is on disk and marked ready.
 */
async function updateBundleIsDownloaded(hash: string): Promise<boolean> {
  if (Updater.updateInfo()?.updateReady !== true) return false;
  const bundlePath = join(await Updater.appDataFolder(), 'self-extraction', `${hash}.tar`);
  return Bun.file(bundlePath).exists();
}

/**
 * Installs the downloaded bundle on Windows with our own apply step, which
 * waits only for this process instead of every Bun app on the PC.
 *
 * @param hash Hash of the downloaded bundle.
 */
async function updateBundleApplyWindows(hash: string): Promise<void> {
  const localInfo = await Updater.getLocalInfo();
  const appDataFolder = await Updater.appDataFolder();
  await windowsUpdateApply({
    appDataFolder,
    appName: localInfo.name,
    hash,
    appProcessId: process.pid,
    quit: Utils.quit,
  });
}

/**
 * Starts the local MCP host and forwards tools into the webview editor.
 *
 * @returns Start result with URL and token.
 */
function startMcpServer() {
  return mcpHost.start(async (name, args) => {
    if (!desktopRpc) {
      return { ok: false, message: 'Desktop RPC is not ready' };
    }
    return desktopRpc.request.invokeEditorTool({ name, arguments: args });
  });
}

/**
 * Stops the local MCP host.
 *
 * @returns Host status snapshot.
 */
function stopMcpServer() {
  return mcpHost.stop();
}

/**
 * Returns whether the MCP host is running.
 *
 * @returns Host status snapshot.
 */
function getMcpStatus() {
  return mcpHost.getStatus();
}

/**
 * Opens the native dialog for one project folder.
 *
 * @returns Picked folder path, or null when cancelled.
 */
async function pickProjectFolder(): Promise<string | null> {
  const picked = await Utils.openFileDialog({
    canChooseFiles: false,
    canChooseDirectory: true,
    allowsMultipleSelection: false,
  });
  return picked[0] || null;
}
