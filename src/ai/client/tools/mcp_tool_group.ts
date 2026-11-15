import type { McpTool } from './mcp_tool.js';

/**
 * Base class of one category of MCP tools. Every tool name of a group starts
 * with the group category, followed by the specific subject and the verb.
 */
export abstract class McpToolGroup {
  /** Category prefix shared by every tool of the group. */
  abstract readonly category: string;
  /** One-line summary of the category, used in the server instructions. */
  abstract readonly summary: string;

  /**
   * Returns the tools of this group in listing order: reads first, then
   * creation, edits and removal.
   *
   * @returns Tools.
   */
  abstract tools(): McpTool[];
}
