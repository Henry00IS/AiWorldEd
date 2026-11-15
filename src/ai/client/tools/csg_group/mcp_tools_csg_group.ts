import { MCP_SCHEMA_GROUP_OPERATION } from '@/ai/client/tools/mcp_tool_schema.js';
import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

import { mcpArgumentString } from '@/ai/client/tools/mcp_tool_arguments.js';
import type {
  CreateCsgGroupArgs,
  RenameGroupArgs,
  SetGroupOperationArgs,
  UngroupCsgGroupsArgs,
} from '@/ai/client/editor_api_types.js';
/**
 * CSG groups: outliner folders that combine their children, then apply their
 * own operation.
 */
export class McpToolsCsgGroup extends McpToolGroup {
  readonly category = 'csg_group';
  readonly summary = 'CSG groups: outliner folders that combine their children, then apply their own operation.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the csg_group tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'csg_group_get',
        description:
          'One solid CSG compound group: operation, parentGroupId, childBrushIds, childGroupIds. Groups nest; each group has its own CSG operation when combined into its parent.',
        inputSchema: {
          type: 'object',
          properties: { groupId: { type: 'string', description: 'Solid CSG group uuid from hierarchy.' } },
          required: ['groupId'],
        },
        mutates: false,
        run: (args) => this.parts.reads.getCsgGroup(mcpArgumentString(args, 'groupId')),
      },
      {
        name: 'csg_group_create',
        description:
          'Group solid brushes and/or nested CSG groups into a new solid CSG compound (same as outliner Group). Members stay under the solid model. operation is the branch op when the group combines into its parent (default additive); passthrough makes it a plain folder whose members combine in the parent as if ungrouped. Optional parentGroupId nests the new group under another group (must not be a member or under a member).',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            brushIds: { type: 'array', items: { type: 'string' }, description: 'Brushes to put in the new group.' },
            groupIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Existing solid CSG group uuids to nest under the new group.',
            },
            parentGroupId: {
              type: 'string',
              description: 'Parent solid CSG group uuid; omit for solid model root.',
            },
            name: {
              type: 'string',
              description: 'Display name shown in the outliner; stable names make brush_find easy.',
            },
            operation: MCP_SCHEMA_GROUP_OPERATION,
          },
          required: ['modelId'],
        },
        mutates: true,
        run: (args) => this.parts.hierarchy.createCsgGroup(args as unknown as CreateCsgGroupArgs),
      },
      {
        name: 'csg_group_operation_set',
        description:
          'Set CSG operation on solid CSG groups (branch ops). Additive keeps yellow folder in outliner; subtractive/intersecting show red/blue badges; passthrough shows an open folder with a gray badge and makes the group a plain folder whose children combine in the parent as if ungrouped. Rebuilds solid CSG.',
        inputSchema: {
          type: 'object',
          properties: {
            groupIds: { type: 'array', items: { type: 'string' }, description: 'Groups to change.' },
            operation: MCP_SCHEMA_GROUP_OPERATION,
          },
          required: ['groupIds', 'operation'],
        },
        mutates: true,
        run: (args) => this.parts.hierarchy.setGroupOperation(args as unknown as SetGroupOperationArgs),
      },
      {
        name: 'csg_group_rename',
        description: 'Rename a solid CSG group (outliner display name).',
        inputSchema: {
          type: 'object',
          properties: {
            groupId: { type: 'string', description: 'CSG group id from scene_hierarchy_get.' },
            name: { type: 'string', description: 'New display name.' },
          },
          required: ['groupId', 'name'],
        },
        mutates: true,
        run: (args) => this.parts.hierarchy.renameGroup(args as unknown as RenameGroupArgs),
      },
      {
        name: 'csg_group_ungroup',
        description:
          'Dissolve solid CSG groups; children reparent to the former group parent (solid root or outer group). Undoable. Rebuilds CSG.',
        inputSchema: {
          type: 'object',
          properties: { groupIds: { type: 'array', items: { type: 'string' }, description: 'Groups to dissolve.' } },
          required: ['groupIds'],
        },
        mutates: true,
        run: (args) => this.parts.hierarchy.ungroupCsgGroups(args as unknown as UngroupCsgGroupsArgs),
      },
    ];
  }
}
