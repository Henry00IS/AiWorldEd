import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { McpToolDefinition } from '@/ai/shared/mcp_tool_definition.js';
import type { McpTool } from './mcp_tool.js';
import type { McpToolGroup } from './mcp_tool_group.js';

/**
 * Ordered set of every MCP tool, built from tool groups. Tools are rebuilt on
 * each listing so registries the groups read from (modifier kinds, menus,
 * object properties) show up without a restart.
 */
export class McpToolCatalog {
  private readonly groups: readonly McpToolGroup[];

  /**
   * Creates a catalog.
   *
   * @param groups Tool groups in listing order.
   */
  constructor(groups: readonly McpToolGroup[]) {
    this.groups = groups;
  }

  /**
   * Returns every tool in listing order.
   *
   * @returns Tools.
   */
  toolsAll(): McpTool[] {
    return this.groups.flatMap((group) => group.tools());
  }

  /**
   * Returns the tools/list definitions.
   *
   * @returns Definitions without run handlers.
   */
  definitionsList(): McpToolDefinition[] {
    return this.toolsAll().map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  }

  /**
   * Returns the groups in listing order.
   *
   * @returns Groups.
   */
  groupsList(): readonly McpToolGroup[] {
    return this.groups;
  }

  /**
   * Finds one tool by name.
   *
   * @param name Tool name.
   * @returns Tool, or undefined.
   */
  toolFind(name: string): McpTool | undefined {
    return this.toolsAll().find((tool) => tool.name === name);
  }

  /**
   * Runs one tool by name, turning thrown errors into failed results.
   *
   * @param name Tool name.
   * @param args Tool arguments.
   * @returns Tool result envelope.
   */
  toolRun(name: string, args: Record<string, unknown>): McpToolResult {
    const tool = this.toolFind(name);
    if (!tool) return { ok: false, message: `Unknown tool: ${name}. Call tools/list for the current tool names.` };
    try {
      return tool.run(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `${name} failed: ${message}` };
    }
  }

  /**
   * Returns whether a tool may change the scene; unknown tools count as
   * mutating.
   *
   * @param name Tool name.
   * @returns True unless the tool is a known read.
   */
  toolMutates(name: string): boolean {
    return this.toolFind(name)?.mutates ?? true;
  }
}
