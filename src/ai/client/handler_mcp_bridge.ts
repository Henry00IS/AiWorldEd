import type { EditorApi } from './editor_api.js';
import { editorApiToolMutates } from './editor_api_tool_kinds.js';
import type { McpInvokeEditorToolParams, McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Runs a mutating tool inside a shared room: takes the locks the tool needs as
 * the local user, sends its edit and reports refusals as structured errors.
 */
export interface McpEditorToolGuard {
  /**
   * Runs one mutating tool.
   *
   * @param name Tool name.
   * @param invoke Runs the tool against the editor.
   * @returns Tool result, or a refusal.
   */
  run(name: string, invoke: () => McpToolResult): Promise<McpToolResult>;
}

/** Invokes named MCP editor tools through a bound EditorApi. */
export class HandlerMcpBridge {
  private editorApi: EditorApi | null;
  private guard: McpEditorToolGuard | null;
  private queue: Promise<unknown>;

  /** Creates a bridge with no API bound yet. */
  constructor() {
    this.editorApi = null;
    this.guard = null;
    this.queue = Promise.resolve();
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
   * Installs the collaboration guard of a joined room, or removes it.
   *
   * @param guard Guard, or null outside a room.
   */
  guardSet(guard: McpEditorToolGuard | null): void {
    this.guard = guard;
  }

  /**
   * Invokes a named tool with JSON arguments. Mutating tools run one at a time
   * through the collaboration guard while a room is joined.
   *
   * @param params Tool name and arguments from the MCP host.
   * @returns Tool result envelope.
   */
  invokeEditorTool(params: McpInvokeEditorToolParams): Promise<McpToolResult> {
    const result = this.queue.then(() => this.invoke(params));
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Runs one tool, through the guard when it mutates inside a room.
   *
   * @param params Tool name and arguments.
   * @returns Tool result envelope.
   */
  private invoke(params: McpInvokeEditorToolParams): Promise<McpToolResult> {
    const editorApi = this.editorApi;
    if (!editorApi) return Promise.resolve({ ok: false, message: 'Editor API is not ready' });
    const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
    const invoke = (): McpToolResult => editorApi.invokeTool(params.name, args);
    const guard = this.guard;
    if (guard === null || !editorApiToolMutates(params.name)) return Promise.resolve(invoke());
    return guard.run(params.name, invoke);
  }
}

/** Shared HandlerMcpBridge instance. */
export const sharedMcpBridgeHandler = new HandlerMcpBridge();
