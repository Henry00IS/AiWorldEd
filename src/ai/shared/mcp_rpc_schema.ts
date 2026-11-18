import type { StandaloneHostUpdateCheck, UpdateInstallProgress } from '@/updater/update_types.js';
import type { ProjectDesktopRequests } from '@/project/desktop/project_desktop_protocol.js';
import type { DesktopFullscreenRequests } from '@/desktop/fullscreen/desktop_fullscreen_protocol.js';
import type { DiscordRichPresenceRequests } from '@/desktop/discord/discord_rich_presence_protocol.js';
import type { McpToolDefinition } from './mcp_tool_definition.js';
import type {
  McpHostStartResult,
  McpHostStatus,
  McpInvokeEditorToolParams,
  McpToolResult,
} from './mcp_protocol_types.js';

/** Electrobun RPC schema for bun and webview request and message surfaces. */
export interface ElectrobunDesktopRpcSchema {
  bun: {
    requests: ProjectDesktopRequests &
      DesktopFullscreenRequests &
      DiscordRichPresenceRequests & {
        checkForUpdate: { params: undefined; response: StandaloneHostUpdateCheck };
        downloadUpdate: { params: undefined; response: void };
        applyUpdate: { params: undefined; response: void };
        startMcpServer: { params: undefined; response: McpHostStartResult };
        stopMcpServer: { params: undefined; response: McpHostStatus };
        getMcpStatus: { params: undefined; response: McpHostStatus };
        getAppVersion: { params: undefined; response: string };
        setWindowTitle: { params: { title: string }; response: void };
      };
    messages: {};
  };
  webview: {
    requests: {
      invokeEditorTool: { params: McpInvokeEditorToolParams; response: McpToolResult };
      listEditorTools: { params: undefined; response: McpToolDefinition[] };
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
    getAppVersion: () => Promise<string>;
    setWindowTitle: (params: { title: string }) => Promise<void>;
  };
}

/**
 * Webview surface: tool listing and invocation requests and update progress
 * messages.
 */
export interface ElectrobunDesktopWebviewCaller {
  request: {
    invokeEditorTool: (params: McpInvokeEditorToolParams) => Promise<McpToolResult>;
    listEditorTools: () => Promise<McpToolDefinition[]>;
  };
  send: {
    updateInstallProgress: (progress: UpdateInstallProgress) => void;
  };
}
