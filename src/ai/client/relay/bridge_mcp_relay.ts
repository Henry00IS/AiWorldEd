import type { BridgeMcpDesktop } from '@/ai/client/bridge_mcp_desktop.js';
import { sharedMcpBridgeHandler } from '@/ai/client/handler_mcp_bridge.js';
import type { McpHostStartResult, McpHostStatus } from '@/ai/shared/mcp_protocol_types.js';
import { mcpJsonRpcAnswer } from '@/ai/server/mcp_jsonrpc_answer.js';
import { jsonRpcError } from '@/ai/server/mcp_jsonrpc.js';
import type { EditorToolInvoker } from '@/ai/server/mcp_tool_dispatch.js';
import type { McpRelayLink } from './link_mcp_relay.js';
import type { McpSettingsStorage } from '@/ai/client/settings_mcp.js';
import { mcpRelayTokenGet, mcpRelayTokenRegenerate } from './token_mcp_relay.js';

/** Starts, stops and inspects the browser MCP host through a relay connection. */
export class BridgeMcpRelay implements BridgeMcpDesktop {
  private token: string | null = null;

  /**
   * Creates a bridge bound to one editor's relay link.
   *
   * @param link Relay link.
   * @param storage Settings storage.
   * @param invoker Tool invoker; defaults to the shared editor bridge.
   */
  constructor(
    private readonly link: McpRelayLink,
    private readonly storage: McpSettingsStorage | null,
    private readonly invoker: EditorToolInvoker = (name, args) =>
      sharedMcpBridgeHandler.invokeEditorTool({ name, arguments: args }, true),
  ) {}

  /**
   * Starts listening on the stored token.
   *
   * @returns Start result with the stable relay URL or an error message.
   */
  async startMcpServer(): Promise<McpHostStartResult> {
    try {
      const token = this.tokenGet();
      await this.link.mcpListen(token, (body, fits) => this.answer(body, fits));
      return { ok: true, message: 'MCP server started', status: await this.getMcpStatus() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: mcpRelayErrorMessage(message), status: await this.getMcpStatus() };
    }
  }

  /**
   * Stops accepting MCP without changing the token.
   *
   * @returns Updated host status.
   */
  async stopMcpServer(): Promise<McpHostStatus> {
    this.link.mcpUnlisten();
    return this.getMcpStatus();
  }

  /**
   * Returns current listening state and the stable relay URL, even while
   * stopped.
   *
   * @returns Host status.
   */
  async getMcpStatus(): Promise<McpHostStatus> {
    return { running: this.link.mcpListening(), port: null, url: await this.link.mcpUrl(this.tokenGet()) };
  }

  /**
   * Stops accepting MCP and replaces the token. The user must start again.
   *
   * @returns Updated status with the new URL.
   */
  async regenerateToken(): Promise<McpHostStatus> {
    this.link.mcpUnlisten();
    this.token = mcpRelayTokenRegenerate(this.storage);
    return this.getMcpStatus();
  }

  /**
   * Returns the token, creating and storing it on first use.
   *
   * @returns 64 character base64url token.
   */
  private tokenGet(): string {
    this.token ??= mcpRelayTokenGet(this.storage);
    return this.token;
  }

  /**
   * Answers a request through the shared MCP dispatcher, bounded to one relay
   * frame.
   *
   * @param body Raw JSON-RPC request body.
   * @param fits Returns whether the response fits one relay frame.
   * @returns Raw JSON-RPC response text, or an empty string for notifications.
   */
  private async answer(body: string, fits: (response: string) => boolean): Promise<string> {
    try {
      const answer = await mcpJsonRpcAnswer(body, this.invoker);
      if (answer.response === null) return '';
      const text = JSON.stringify(answer.response);
      if (fits(text)) return text;
      return JSON.stringify(
        jsonRpcError(
          answer.response.id,
          -32603,
          'MCP response is larger than one relay message (about 1 MiB); use the Online Link image delivery or ask for less data',
        ),
      );
    } catch {
      return JSON.stringify(jsonRpcError(null, -32603, 'MCP tool execution failed'));
    }
  }
}

/**
 * Translates relay error codes into dialog text.
 *
 * @param message Error message or relay code.
 * @returns User-facing error message.
 */
function mcpRelayErrorMessage(message: string): string {
  if (message === 'mcp_token_in_use') return 'MCP is already started in another tab using this URL';
  return message;
}

/** Shared online MCP bridge of the editor. */
let sharedMcpRelayBridge: BridgeMcpRelay | null = null;

/**
 * Installs the relay MCP bridge of the editor.
 *
 * @param bridge Relay bridge.
 */
export function mcpRelayBridgeSet(bridge: BridgeMcpRelay): void {
  sharedMcpRelayBridge = bridge;
}

/**
 * Returns the relay MCP bridge of the editor.
 *
 * @returns Relay bridge, or null before collaboration is installed.
 */
export function mcpRelayBridgeGet(): BridgeMcpRelay | null {
  return sharedMcpRelayBridge;
}
