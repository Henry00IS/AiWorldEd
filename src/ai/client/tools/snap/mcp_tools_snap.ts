import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { mcpSchemaObject } from '@/ai/client/tools/mcp_tool_schema.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

/** Grid and rotation snapping. */
export class McpToolsSnap extends McpToolGroup {
  readonly category = 'snap';
  readonly summary = 'Grid, rotation and scale snap settings that placement tools follow.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the snap tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'snap_settings_get',
        description:
          'Returns whether snapping is on, the grid interval, the rotation step in degrees and the scale step.',
        inputSchema: mcpSchemaObject({}),
        mutates: false,
        run: () => this.parts.reads.getSnapSettings(),
      },
    ];
  }
}
