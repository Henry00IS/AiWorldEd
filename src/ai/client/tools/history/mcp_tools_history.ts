import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { mcpSchemaObject } from '@/ai/client/tools/mcp_tool_schema.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

/** Undo and redo through the editor history. */
export class McpToolsHistory extends McpToolGroup {
  readonly category = 'history';
  readonly summary = 'Undo and redo; every editing tool is one undo step.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the history tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'history_undo',
        description: 'Undoes the last editor step, exactly like Ctrl+Z.',
        inputSchema: mcpSchemaObject({}),
        mutates: true,
        run: () => this.parts.writes.undo(),
      },
      {
        name: 'history_redo',
        description: 'Redoes the last undone editor step, exactly like Ctrl+Y.',
        inputSchema: mcpSchemaObject({}),
        mutates: true,
        run: () => this.parts.writes.redo(),
      },
    ];
  }
}
