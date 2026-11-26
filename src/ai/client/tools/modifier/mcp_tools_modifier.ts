import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import type { ModifierPlacementArgs } from '@/ai/client/modifier/editor_api_modifier.js';
import type { McpToolSchema } from '@/ai/shared/mcp_tool_definition.js';
import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import {
  MODIFIER_GENERATOR_NODE_KINDS,
  modifierGeneratorNodeLabels,
} from '@/modifier/stack/modifier_generator_node.js';
import {
  mcpArgumentBooleanOptional,
  mcpArgumentNumber,
  mcpArgumentNumberOptional,
  mcpArgumentObjectOptional,
  mcpArgumentString,
  mcpArgumentStringOptional,
} from '@/ai/client/tools/mcp_tool_arguments.js';
import { MCP_SCHEMA_VECTOR3 } from '@/ai/client/tools/mcp_tool_schema.js';

/** Holder argument: the object that owns a modifier stack. */
const MCP_SCHEMA_MODIFIER_OBJECT: McpToolSchema = {
  type: 'string',
  description:
    'Modifier volume, generator node (uuid) or brush/CSG group (id) that holds the stack; see modifier_holder_list.',
};

/** Modifier entry argument. */
const MCP_SCHEMA_MODIFIER_ID: McpToolSchema = { type: 'string', description: 'Modifier id from modifier_stack_get.' };

/** Placement of new volumes and generator nodes. */
const MCP_SCHEMA_MODIFIER_PLACEMENT: Record<string, McpToolSchema> = {
  position: { ...MCP_SCHEMA_VECTOR3, description: 'World center (Y-up meters); default origin.' },
  size: { ...MCP_SCHEMA_VECTOR3, description: 'Box size in meters; default 1 x 1 x 1.' },
  rotationDegrees: { ...MCP_SCHEMA_VECTOR3, description: 'Euler rotation in degrees.' },
  name: { type: 'string', description: 'Outliner name.' },
};

/**
 * Builds an object schema whose first properties are the holder and modifier.
 *
 * @param withModifier True adds modifierId.
 * @param properties Further properties.
 * @param required Further required keys.
 * @returns Schema.
 */
function modifierSchema(
  withModifier: boolean,
  properties: Record<string, McpToolSchema>,
  required: string[] = [],
): McpToolSchema {
  const head: Record<string, McpToolSchema> = withModifier
    ? { objectId: MCP_SCHEMA_MODIFIER_OBJECT, modifierId: MCP_SCHEMA_MODIFIER_ID }
    : { objectId: MCP_SCHEMA_MODIFIER_OBJECT };
  return { type: 'object', properties: { ...head, ...properties }, required: [...Object.keys(head), ...required] };
}

/**
 * Reads the placement arguments.
 *
 * @param args Tool arguments.
 * @returns Placement.
 */
function modifierPlacement(args: Record<string, unknown>): ModifierPlacementArgs {
  return args as ModifierPlacementArgs;
}

/**
 * Modifier stacks: kinds with every parameter and its tooltip, volumes, every
 * generator kind, entries, parameters, presets and bake.
 */
export class McpToolsModifier extends McpToolGroup {
  readonly category = 'modifier';
  readonly summary = `Modifier stacks: kinds and parameters with tooltips, modifier volumes, generators (${modifierGeneratorNodeLabels()}), buttons, entries, parameters, presets, bake.`;

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the modifier tools: reads, creation, entry edits, then bake.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [...this.readTools(), ...this.createTools(), ...this.entryTools(), ...this.stackTools()];
  }

  /**
   * Returns the read tools.
   *
   * @returns Tools.
   */
  private readTools(): McpTool[] {
    const modifier = this.parts.modifier;
    return [
      {
        name: 'modifier_kind_list',
        description:
          'Lists modifier kinds and volume templates. With kindId: that kind with every parameter (key, label, type, range, choices, default, tooltip) and its presets. Inspector fields are listed automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            kindId: { type: 'string', description: 'Kind id such as column, array, bevel; omit for the overview.' },
          },
        },
        mutates: false,
        run: (args) => modifier.kindList(mcpArgumentStringOptional(args, 'kindId')),
      },
      {
        name: 'modifier_holder_list',
        description:
          'Lists every object with a modifier stack: modifier volumes, generator nodes, brushes and CSG groups.',
        inputSchema: { type: 'object', properties: {} },
        mutates: false,
        run: () => modifier.holderList(),
      },
      {
        name: 'modifier_stack_get',
        description:
          'One stack: settings, transform and every modifier with its parameter values (inactive ones listed apart) and its buttons with their last status.',
        inputSchema: modifierSchema(false, {}),
        mutates: false,
        run: (args) => modifier.stackGet(mcpArgumentString(args, 'objectId')),
      },
    ];
  }

  /**
   * Returns the creation tools.
   *
   * @returns Tools.
   */
  private createTools(): McpTool[] {
    const modifier = this.parts.modifier;
    return [
      {
        name: 'modifier_volume_create',
        description: 'Creates a scene-level modifier volume from a template; it changes the brushes inside its box.',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'Template id from modifier_kind_list (empty, bevel, linear, radial, ...).',
            },
            ...MCP_SCHEMA_MODIFIER_PLACEMENT,
          },
          required: ['templateId'],
        },
        mutates: true,
        run: (args) => modifier.volumeCreate(mcpArgumentString(args, 'templateId'), modifierPlacement(args)),
      },
      {
        name: 'modifier_generator_create',
        description: `Creates a generator (${modifierGeneratorNodeLabels()}) inside a solid model; it builds brushes filling its box. Tune it with modifier_parameters_set and curve_* tools; modifier_stack_bake turns it into regular brushes (Convert to Brush).`,
        inputSchema: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: [...MODIFIER_GENERATOR_NODE_KINDS], description: 'Generator kind.' },
            modelId: { type: 'string', description: 'Solid model id.' },
            parentGroupId: { type: 'string', description: 'CSG group of modelId; omit for the root.' },
            ...MCP_SCHEMA_MODIFIER_PLACEMENT,
          },
          required: ['kind', 'modelId'],
        },
        mutates: true,
        run: (args) =>
          modifier.generatorCreate(
            mcpArgumentString(args, 'kind'),
            mcpArgumentString(args, 'modelId'),
            mcpArgumentStringOptional(args, 'parentGroupId'),
            modifierPlacement(args),
          ),
      },
    ];
  }

  /**
   * Returns the entry tools.
   *
   * @returns Tools.
   */
  private entryTools(): McpTool[] {
    const modifier = this.parts.modifier;
    const parameters: McpToolSchema = {
      type: 'object',
      description: 'Parameter values by key as modifier_kind_list describes them; objects by id, curves as curve data or Solid Script curve text such as "Classic Column" or "[0, 1], [1, 0]".',
    };
    return [
      {
        name: 'modifier_entry_add',
        description:
          'Adds a modifier to a stack, optionally with parameters. Generator kinds cannot be added; use modifier_generator_create.',
        inputSchema: modifierSchema(
          false,
          {
            kind: { type: 'string', description: 'Kind id.' },
            parameters,
            index: { type: 'integer', description: 'Stack position; default last.' },
          },
          ['kind'],
        ),
        mutates: true,
        run: (args) =>
          modifier.entryAdd(
            mcpArgumentString(args, 'objectId'),
            mcpArgumentString(args, 'kind'),
            mcpArgumentObjectOptional(args, 'parameters'),
            mcpArgumentNumberOptional(args, 'index'),
          ),
      },
      {
        name: 'modifier_entry_remove',
        description: 'Removes a modifier from a stack.',
        inputSchema: modifierSchema(true, {}),
        mutates: true,
        run: (args) => modifier.entryRemove(mcpArgumentString(args, 'objectId'), mcpArgumentString(args, 'modifierId')),
      },
      {
        name: 'modifier_entry_move',
        description: 'Moves a modifier to another stack position (the generator stays first).',
        inputSchema: modifierSchema(true, { index: { type: 'integer', description: 'New 0-based position.' } }, [
          'index',
        ]),
        mutates: true,
        run: (args) =>
          modifier.entryMove(
            mcpArgumentString(args, 'objectId'),
            mcpArgumentString(args, 'modifierId'),
            mcpArgumentNumber(args, 'index'),
          ),
      },
      {
        name: 'modifier_entry_duplicate',
        description: 'Duplicates a modifier right after itself.',
        inputSchema: modifierSchema(true, {}),
        mutates: true,
        run: (args) =>
          modifier.entryDuplicate(mcpArgumentString(args, 'objectId'), mcpArgumentString(args, 'modifierId')),
      },
      {
        name: 'modifier_entry_set',
        description: 'Enables, disables or renames a modifier.',
        inputSchema: modifierSchema(true, {
          enabled: { type: 'boolean', description: 'False turns the modifier off without removing it.' },
          name: { type: 'string', description: 'New display name.' },
        }),
        mutates: true,
        run: (args) =>
          modifier.entrySet(mcpArgumentString(args, 'objectId'), mcpArgumentString(args, 'modifierId'), {
            ...(typeof args['enabled'] === 'boolean' ? { enabled: args['enabled'] } : {}),
            ...(typeof args['name'] === 'string' ? { name: args['name'] } : {}),
          }),
      },
      {
        name: 'modifier_parameters_set',
        description:
          'Sets parameters of a modifier. Unknown keys are refused with the valid list; numbers are clamped to their range with a warning.',
        inputSchema: modifierSchema(true, { parameters }, ['parameters']),
        mutates: true,
        run: (args) =>
          modifier.parametersSet(
            mcpArgumentString(args, 'objectId'),
            mcpArgumentString(args, 'modifierId'),
            mcpArgumentObjectOptional(args, 'parameters') ?? {},
          ),
      },
      {
        name: 'modifier_preset_apply',
        description: "Applies one of the kind's presets (ids from modifier_kind_list with kindId).",
        inputSchema: modifierSchema(true, { presetId: { type: 'string', description: 'Preset id.' } }, ['presetId']),
        mutates: true,
        run: (args) =>
          modifier.presetApply(
            mcpArgumentString(args, 'objectId'),
            mcpArgumentString(args, 'modifierId'),
            mcpArgumentString(args, 'presetId'),
          ),
      },
    ];
  }

  /**
   * Returns the stack-wide tools.
   *
   * @returns Tools.
   */
  private stackTools(): McpTool[] {
    const modifier = this.parts.modifier;
    return [
      {
        name: 'modifier_stack_settings_set',
        description:
          'Sets stack-wide settings: enabled, grouping (compound treats all inside brushes as one shape, brush works per brush) and ignored objects.',
        inputSchema: modifierSchema(false, {
          enabled: { type: 'boolean', description: 'False turns the whole stack off.' },
          grouping: { type: 'string', enum: ['compound', 'brush'], description: 'compound or brush.' },
          excludedIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Brush or group ids the stack ignores.',
          },
        }),
        mutates: true,
        run: (args) =>
          modifier.stackSettingsSet(mcpArgumentString(args, 'objectId'), {
            ...(mcpArgumentBooleanOptional(args, 'enabled') !== undefined ? { enabled: Boolean(args['enabled']) } : {}),
            ...(args['grouping'] !== undefined ? { grouping: args['grouping'] as 'compound' | 'brush' } : {}),
            ...(Array.isArray(args['excludedIds']) ? { excludedIds: args['excludedIds'].map(String) } : {}),
          }),
      },
      {
        name: 'modifier_action_run',
        description:
          "Presses a modifier's inspector button (type action in modifier_kind_list), such as Physics Shatter Simulate or Reset, exactly like a click. Long buttons keep working after this returns; read their status in modifier_stack_get actions.",
        inputSchema: modifierSchema(
          true,
          { actionKey: { type: 'string', description: 'Button key from modifier_kind_list, such as simulate.' } },
          ['actionKey'],
        ),
        mutates: true,
        run: (args) =>
          modifier.actionRun(
            mcpArgumentString(args, 'objectId'),
            mcpArgumentString(args, 'modifierId'),
            mcpArgumentString(args, 'actionKey'),
          ),
      },
      {
        name: 'modifier_stack_bake',
        description: "Bakes a holder's modifiers into plain editable brushes and removes the stack (one undo step).",
        inputSchema: modifierSchema(false, {}),
        mutates: true,
        run: (args) => modifier.bake(mcpArgumentString(args, 'objectId')),
      },
    ];
  }
}
