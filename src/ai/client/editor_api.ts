import type { EditorApiHost } from './editor_api_host.js';
import { EditorApiParts } from './editor_api_parts.js';
import { McpToolCatalog } from './tools/mcp_tool_catalog.js';
import { mcpToolGroupsCreate } from './tools/mcp_tool_groups.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { McpToolDefinition } from '@/ai/shared/mcp_tool_definition.js';

/**
 * Facade that external AI tooling uses to inspect and edit the editor. All
 * mutations go through the same undoable commands and controllers as the UI.
 */
export class EditorApi {
  private readonly catalog: McpToolCatalog;

  /**
   * Creates an editor API bound to live editor systems.
   *
   * @param host Injected host dependencies.
   */
  constructor(host: EditorApiHost) {
    this.catalog = new McpToolCatalog(mcpToolGroupsCreate(new EditorApiParts(host)));
  }

  /**
   * Returns the tool catalog.
   *
   * @returns Catalog.
   */
  catalogGet(): McpToolCatalog {
    return this.catalog;
  }

  /**
   * Lists every tool in catalog order.
   *
   * @returns Tool definitions.
   */
  toolsList(): McpToolDefinition[] {
    return this.catalog.definitionsList();
  }

  /**
   * Returns whether a tool may change the scene, the selection or the history.
   *
   * @param name Tool name.
   * @returns True unless the tool is a known read.
   */
  toolMutates(name: string): boolean {
    return this.catalog.toolMutates(name);
  }

  /**
   * Runs a tool by name with a plain argument object.
   *
   * @param name MCP tool name.
   * @param args Tool arguments from the client.
   * @param internal Editor-side options added after argument checks, such as
   *   capture delivery.
   * @returns Tool result envelope.
   */
  invokeTool(name: string, args: Record<string, unknown> = {}, internal: Record<string, unknown> = {}): McpToolResult {
    return this.catalog.toolRun(name, args, internal);
  }
}
