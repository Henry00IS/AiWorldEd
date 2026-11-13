import { APPLICATION_VERSION, buildWindowTitle } from '@/application_identity.js';
import type { ElectrobunDesktopRpcSchema, ElectrobunDesktopWebviewCaller } from '@/ai/shared/mcp_rpc_schema.js';
import { McpHost } from '@/ai/server/mcp_host.js';
import { ElectrobunUpdateHost } from '@/updater/electrobun_update_host.js';
import { buildDesktopWindowFrame } from '@/desktop/desktop_window_maximize.js';
import { showMaximizedWhenReady } from '@/desktop/desktop_window_startup.js';
import { desktopFullscreenToggle } from '@/desktop/fullscreen/desktop_fullscreen_toggle.js';
import { enableWindowsPerMonitorDpiAwareness } from '@/desktop/windows_dpi_awareness.js';
import { applyWindowsWindowIcon } from '@/desktop/windows_window_icon.js';
import { applyLinuxWindowIcon } from '@/desktop/linux_window_icon.js';
import { ProjectDesktopHost } from '@/project/desktop/project_desktop_host.js';

await enableWindowsPerMonitorDpiAwareness();

const { BrowserView, BrowserWindow, Screen, Updater, Utils } = await import('electrobun/main');

const mcpHost = new McpHost();
const projectHost = new ProjectDesktopHost(`${Utils.paths.userData}/project_folders.json`, pickProjectFolder);
let desktopRpc: ElectrobunDesktopWebviewCaller | null = null;
let desktopWindow: InstanceType<typeof BrowserWindow> | null = null;
let appVersion = APPLICATION_VERSION;

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
      getAppVersion: () => appVersion,
      setWindowTitle: (params: { title: string }) => {
        desktopWindow?.setTitle(params.title);
      },
      windowFullscreenToggle: () => (desktopWindow ? desktopFullscreenToggle(desktopWindow) : false),
    },
  },
});
desktopRpc = desktopRpcBinding as unknown as ElectrobunDesktopWebviewCaller;
const updateHost = new ElectrobunUpdateHost({
  updater: Updater,
  progressSend: (progress) => desktopRpc?.send.updateInstallProgress(progress),
  bundleIsDownloaded: updateBundleIsDownloaded,
});

const localInfo = await Updater.getLocalInfo();
appVersion = localInfo.version.trim() || APPLICATION_VERSION;
const windowTitle = buildWindowTitle({ includeVersion: true, version: appVersion });
const desktopFrame = buildDesktopWindowFrame(Screen.getPrimaryDisplay().workArea);

desktopWindow = new BrowserWindow({
  title: windowTitle,
  url: 'views://main_ui/index.html',
  frame: desktopFrame,
  hidden: true,
  activate: false,
  rpc: desktopRpcBinding,
});
const shownWindow = desktopWindow;
showMaximizedWhenReady(shownWindow, async () => {
  await applyWindowsWindowIcon(windowTitle);
  await applyLinuxWindowIcon(shownWindow);
});

/**
 * Returns whether Electrobun has downloaded, verified and staged the bundle.
 *
 * @param hash Hash of the bundle.
 * @returns True when the staged update is this bundle and ready to install.
 */
async function updateBundleIsDownloaded(hash: string): Promise<boolean> {
  const updateInfo = Updater.updateInfo();
  return updateInfo.updateReady && updateInfo.hash === hash;
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
