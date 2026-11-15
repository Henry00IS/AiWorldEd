import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

import { mcpSchemaObject } from '@/ai/client/tools/mcp_tool_schema.js';
import type { ReparentSolidNodesArgs } from '@/ai/client/editor_api_types.js';
/** The outliner hierarchy of solid models, CSG groups and brushes; reparenting. */
export class McpToolsScene extends McpToolGroup {
  readonly category = 'scene';
  readonly summary = 'The outliner hierarchy of solid models, CSG groups and brushes; reparenting.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the scene tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'scene_hierarchy_get',
        description:
          'Solid outliner tree: solid_model → csg_group (with operation) → brush (with operation). Groups may nest. Use this to understand nesting before reparent/group ops.',
        inputSchema: mcpSchemaObject({}),
        mutates: false,
        run: () => this.parts.reads.getSceneHierarchy(),
      },
      {
        name: 'scene_hierarchy_reparent',
        description:
          'Move solid brushes and/or CSG groups under a solid model root or another CSG group in the same solid (outliner drag). parentId = modelId or groupId. Optional nodeIdBefore (brush or group) for sibling order. Same solid only; no cycles.',
        inputSchema: {
          type: 'object',
          properties: {
            nodeIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Brush ids and/or solid CSG group uuids.',
            },
            parentId: {
              type: 'string',
              description: 'Destination solid model uuid (root) or solid CSG group uuid.',
            },
            nodeIdBefore: {
              type: 'string',
              description: 'Optional sibling brush id or group uuid to insert before.',
            },
          },
          required: ['nodeIds', 'parentId'],
        },
        mutates: true,
        run: (args) => this.parts.hierarchy.reparentSolidNodes(args as unknown as ReparentSolidNodesArgs),
      },
    ];
  }
}
