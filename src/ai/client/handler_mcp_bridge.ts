import type { EditorApi } from './editor_api.js';
import type { McpInvokeEditorToolParams, McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/** Invokes named MCP editor tools through a bound EditorApi. */
export class HandlerMcpBridge {
  private editorApi: EditorApi | null;

  /** Creates a bridge with no API bound yet. */
  constructor() {
    this.editorApi = null;
  }

  /**
   * Binds the live editor API used for tool execution.
   *
   * @param editorApi Editor API instance.
   */
  bindEditorApi(editorApi: EditorApi): void {
    this.editorApi = editorApi;
  }

  /**
   * Invokes a named tool with JSON arguments.
   *
   * @param params Tool name and arguments from the MCP host.
   * @returns Tool result envelope.
   */
  invokeEditorTool(params: McpInvokeEditorToolParams): McpToolResult {
    if (!this.editorApi) {
      return { ok: false, message: 'Editor API is not ready' };
    }
    const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
    return this.editorApi.invokeTool(params.name, args);
  }
}

/** Shared HandlerMcpBridge instance. */
export const sharedMcpBridgeHandler = new HandlerMcpBridge();
