import type { StandaloneHostUpdateCheck, UpdateInstallProgress } from '@/updater/update_types.js';
import type { ProjectDesktopRequests } from '@/project/desktop/project_desktop_protocol.js';
import type {
  McpHostStartResult,
  McpHostStatus,
  McpInvokeEditorToolParams,
  McpToolResult,
} from './mcp_protocol_types.js';

/** Electrobun RPC schema for bun and webview request and message surfaces. */
export interface ElectrobunDesktopRpcSchema {
  bun: {
    requests: ProjectDesktopRequests & {
      checkForUpdate: { params: undefined; response: StandaloneHostUpdateCheck };
      downloadUpdate: { params: undefined; response: void };
      applyUpdate: { params: undefined; response: void };
      startMcpServer: { params: undefined; response: McpHostStartResult };
      stopMcpServer: { params: undefined; response: McpHostStatus };
      getMcpStatus: { params: undefined; response: McpHostStatus };
    };
    messages: {};
  };
  webview: {
    requests: {
      invokeEditorTool: { params: McpInvokeEditorToolParams; response: McpToolResult };
    };
    messages: {
      updateInstallProgress: UpdateInstallProgress;
    };
  };
}

/** Bun-side request surface for update and MCP host control methods. */
export interface ElectrobunDesktopBunRpcClient {
  request: {
    checkForUpdate: () => Promise<StandaloneHostUpdateCheck>;
    downloadUpdate: () => Promise<void>;
    applyUpdate: () => Promise<void>;
    startMcpServer: () => Promise<McpHostStartResult>;
    stopMcpServer: () => Promise<McpHostStatus>;
    getMcpStatus: () => Promise<McpHostStatus>;
  };
}

/** Webview surface: invokeEditorTool requests and update progress messages. */
export interface ElectrobunDesktopWebviewCaller {
  request: {
    invokeEditorTool: (params: McpInvokeEditorToolParams) => Promise<McpToolResult>;
  };
  send: {
    updateInstallProgress: (progress: UpdateInstallProgress) => void;
  };
}
