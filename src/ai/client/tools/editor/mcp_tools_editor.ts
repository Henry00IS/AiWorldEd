import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { mcpSchemaObject } from '@/ai/client/tools/mcp_tool_schema.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

/** Editor-wide context: version, coordinate system, history and selection. */
export class McpToolsEditor extends McpToolGroup {
  readonly category = 'editor';
  readonly summary = 'Editor version, coordinate system, history counts and selection summary.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the editor tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'editor_context_get',
        description:
          'Call first. Returns the editor version, coordinate system (right-handed, Y up, meters), snap settings, undo/redo counts and a selection summary.',
        inputSchema: mcpSchemaObject({}),
        mutates: false,
        run: () => this.parts.reads.getEditorContext(),
      },
    ];
  }
}
