import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { mcpSchemaObject, mcpSchemaStringArray } from '@/ai/client/tools/mcp_tool_schema.js';
import { mcpArgumentStringArray } from '@/ai/client/tools/mcp_tool_arguments.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

/** The editor's object selection. */
export class McpToolsSelection extends McpToolGroup {
  readonly category = 'selection';
  readonly summary = 'Read or replace the object selection the user sees.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the selection tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'selection_get',
        description: 'Returns the selected brushIds, CSG groupIds and solidModelIds.',
        inputSchema: mcpSchemaObject({}),
        mutates: false,
        run: () => this.parts.reads.getSelection(),
      },
      {
        name: 'selection_set',
        description: 'Replaces the object selection with the given brushes.',
        inputSchema: mcpSchemaObject(
          { brushIds: mcpSchemaStringArray('Brush ids to select; an empty list clears the selection.') },
          ['brushIds'],
        ),
        mutates: true,
        run: (args) => this.parts.writes.selectBrushes(mcpArgumentStringArray(args, 'brushIds')),
      },
    ];
  }
}
