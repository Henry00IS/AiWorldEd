import { Electroview } from 'electrobun/view';
import { buildWindowTitle } from '@/application_identity.js';
import { sharedMcpBridgeHandler } from '@/ai/client/handler_mcp_bridge.js';
import { createMcpDesktopBridge } from '@/ai/client/bridge_mcp_desktop.js';
import type { ElectrobunDesktopBunRpcClient, ElectrobunDesktopRpcSchema } from '@/ai/shared/mcp_rpc_schema.js';
import type { McpInvokeEditorToolParams } from '@/ai/shared/mcp_protocol_types.js';
import { ElectrobunUpdaterBridge, type ElectrobunUpdaterRpcClient } from '@/updater/electrobun_updater_rpc.js';
import type { UpdateInstallProgress } from '@/updater/update_types.js';
import {
  createProjectDesktopBridge,
  type ProjectDesktopRpcClient,
} from '@/project/desktop/project_desktop_protocol.js';

let updaterBridge: ElectrobunUpdaterBridge | null = null;

const desktopRpc = Electroview.defineRPC<ElectrobunDesktopRpcSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {
      invokeEditorTool: (params: McpInvokeEditorToolParams) => sharedMcpBridgeHandler.invokeEditorTool(params),
    },
    messages: {
      updateInstallProgress: (progress: UpdateInstallProgress) => updaterBridge?.progressReceive(progress),
    },
  },
}) as unknown as ElectrobunDesktopBunRpcClient & ElectrobunUpdaterRpcClient & ProjectDesktopRpcClient;

new Electroview({ rpc: desktopRpc as never });
updaterBridge = new ElectrobunUpdaterBridge(desktopRpc);
window.aiworldedStandaloneUpdater = updaterBridge;
window.aiworldedMcpBridge = createMcpDesktopBridge(desktopRpc);
window.aiworldedProjectBridge = createProjectDesktopBridge(desktopRpc);
const appVersion = await desktopRpc.request.getAppVersion();
window.aiworldedAppVersion = appVersion;
window.aiworldedSetWindowTitle = (title) => {
  void desktopRpc.request.setWindowTitle({ title });
};
document.title = buildWindowTitle({ includeVersion: true, version: appVersion });
await import('@/app.js');
