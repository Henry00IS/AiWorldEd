import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

import { mcpSchemaObject } from '@/ai/client/tools/mcp_tool_schema.js';
import { mcpArgumentString, mcpArgumentStringOptional } from '@/ai/client/tools/mcp_tool_arguments.js';
/** Solid models: containers whose brushes combine by CSG in order. */
export class McpToolsSolidModel extends McpToolGroup {
  readonly category = 'solid_model';
  readonly summary = 'Solid models: containers whose brushes combine by CSG in order.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the solid_model tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'solid_model_list',
        description: 'List solid models with brush counts and world bounds.',
        inputSchema: mcpSchemaObject({}),
        mutates: false,
        run: () => this.parts.reads.listSolidModels(),
      },
      {
        name: 'solid_model_get',
        description:
          'Full solid model: ordered CSG brush list (evaluation order) plus nested hierarchy tree (solid root → csg_group → brush). Brushes include parentGroupId when nested under a compound group.',
        inputSchema: {
          type: 'object',
          properties: { modelId: { type: 'string', description: 'Solid model id from solid_model_list.' } },
          required: ['modelId'],
        },
        mutates: false,
        run: (args) => this.parts.reads.getSolidModel(mcpArgumentString(args, 'modelId')),
      },
      {
        name: 'solid_model_validate',
        description: 'Validate all brushes and report simple CSG warnings.',
        inputSchema: {
          type: 'object',
          properties: { modelId: { type: 'string', description: 'Solid model id from solid_model_list.' } },
          required: ['modelId'],
        },
        mutates: false,
        run: (args) => this.parts.validation.validateSolidModel(mcpArgumentString(args, 'modelId')),
      },
      {
        name: 'solid_model_create',
        description: 'Create a solid model with one additive unit box brush.',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Model name.' } },
        },
        mutates: true,
        run: (args) => this.parts.writes.createSolidModel(mcpArgumentStringOptional(args, 'name')),
      },
      {
        name: 'solid_model_inverted_world_set',
        description:
          'ADVANCED. Default false: space starts void; additive brushes create solid; subtractive brushes carve holes from prior solid. inverted=true: space starts solid and subtractives dig voids (Source-style). Leave false for normal box maps and room shells. Do NOT enable just to cut doors.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            inverted: {
              type: 'boolean',
              description:
                'True starts the model solid so subtractive brushes dig rooms; false (default) starts empty.',
            },
          },
          required: ['modelId', 'inverted'],
        },
        mutates: true,
        run: (args) =>
          this.parts.writes.setInvertedWorld(mcpArgumentString(args, 'modelId'), Boolean(args['inverted'])),
      },
    ];
  }
}
