import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import type { GeometrySolidScriptArgs } from '@/ai/client/editor_api_geometry.js';
import {
  EditorApiGeometryScript,
  type GeometryScriptGeneratorSetArgs,
} from '@/ai/client/editor_api_geometry_script.js';
import type { McpToolSchema } from '@/ai/shared/mcp_tool_definition.js';
import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { MCP_SCHEMA_OPERATION, MCP_SCHEMA_VECTOR3 } from '@/ai/client/tools/mcp_tool_schema.js';
import { SOLID_SCRIPT_REFERENCE_SUMMARY } from '@/solid_script/reference/solid_script_reference.js';

/** A script as block lines, shared by every tool that takes one. */
const MCP_GEOMETRY_SCRIPT_LINES = {
  type: 'array',
  description:
    'The script as block lines, in order, exactly like the script editor: there is no code text. Blocks such as translate, difference or repeat hold the lines up to their {command: "end"}; {command: "blank"} is an empty line. Shapes are centered on the origin, the center of the generator (or the build position), so no Translate is needed to place them. Example of a wall with a doorway: [{command: "difference"}, {command: "cube", values: {size: "4, 0.2, 3"}}, {command: "translate", values: {v: "0, 0, -0.45"}}, {command: "cube", values: {size: "1, 0.4, 2.1"}}, {command: "end"}, {command: "end"}]. Errors name the line number in this list, counting from 1.',
  items: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command id from geometry_script_command_list.' },
      values: {
        type: 'object',
        description:
          'Field values by key, always plain-text strings without quotes: a number "2", a list "1, 2, 3", points "0, 0; 1, 0; 0, 1", "true"/"false", a variable "[Width]", a formula "[=[Width] * 2]", or text mixing them "Width is [Width]"; $[ $] $$ write literal brackets and dollars; name fields take a plain name; missing keys keep their defaults.',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['command'],
  },
};

/** Input schema shared by build and preview. */
const MCP_GEOMETRY_SCRIPT_BUILD_SCHEMA: McpToolSchema = {
  type: 'object',
  properties: {
    lines: MCP_GEOMETRY_SCRIPT_LINES,
    modelId: { type: 'string', description: 'Solid model to add to; omit to create a new solid model.' },
    parentGroupId: { type: 'string', description: 'CSG group of modelId to add under; omit for the model root.' },
    name: {
      type: 'string',
      description: 'New model name when modelId is omitted, otherwise a prefix for every created name.',
    },
    position: {
      ...MCP_SCHEMA_VECTOR3,
      description: 'Editor world offset (Y-up) added to the whole result; default origin.',
    },
    operation: {
      ...MCP_SCHEMA_OPERATION,
      description:
        'Operation of every top-level result; subtractive carves the result out of existing brushes. Default additive.',
    },
  },
  required: ['lines'],
};

/** The generator argument of the script generator tools. */
const MCP_GEOMETRY_SCRIPT_OBJECT = {
  type: 'string',
  description: 'SolidScript generator node id (modifier_generator_create kind solidScript).',
};

/** Input schema of geometry_script_generator_get. */
const MCP_GEOMETRY_SCRIPT_GET_SCHEMA: McpToolSchema = {
  type: 'object',
  properties: { objectId: MCP_GEOMETRY_SCRIPT_OBJECT },
  required: ['objectId'],
};

/** Input schema of geometry_script_generator_set. */
const MCP_GEOMETRY_SCRIPT_SET_SCHEMA: McpToolSchema = {
  type: 'object',
  properties: {
    objectId: MCP_GEOMETRY_SCRIPT_OBJECT,
    name: { type: 'string', description: 'New script name, shown in the inspector and used for its file.' },
    lines: {
      ...MCP_GEOMETRY_SCRIPT_LINES,
      description: `New script; omit to keep the lines. ${MCP_GEOMETRY_SCRIPT_LINES.description}`,
    },
    placement: {
      type: 'string',
      enum: ['origin', 'fit', 'stretch'],
      description:
        "'origin' keeps script units around the box's center, 'fit' scales uniformly into the box, 'stretch' fills it.",
    },
    inputs: {
      type: 'object',
      additionalProperties: { type: ['number', 'string', 'boolean'] },
      description:
        'Values for the Input lines of the script, by input name, like the inspector sets them, e.g. {"steps": 12, "rails": true}; inputs left out keep their value. Each runs the script\'s When Input Changes blocks, which may change values; their messages come back as notices.',
    },
    press: {
      type: 'string',
      description:
        'Name of a button Input to press after the inputs, running its When Button Pressed blocks like a click in the inspector.',
    },
  },
  required: ['objectId'],
};

/**
 * Geometry languages: describe solids in an existing standard instead of
 * computing brush math.
 */
export class McpToolsGeometry extends McpToolGroup {
  readonly category = 'geometry';
  readonly summary =
    'Geometry languages: describe solids as a SolidScript and get ordered CSG brushes and groups in one undo step.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
    this.script = new EditorApiGeometryScript(parts.host);
  }

  /** Script generator reads and writes. */
  private readonly script: EditorApiGeometryScript;

  /**
   * Returns the geometry tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [...this.buildTools(), ...this.referenceTools(), ...this.generatorTools()];
  }

  /**
   * Returns the tools that run SolidScript lines into brushes.
   *
   * @returns Tools.
   */
  private buildTools(): McpTool[] {
    return [
      {
        name: 'geometry_script_preview',
        description: `Dry run of geometry_script_build: runs SolidScript block lines and returns the brush/group tree with operations and centers without changing the scene. ${SOLID_SCRIPT_REFERENCE_SUMMARY}`,
        inputSchema: MCP_GEOMETRY_SCRIPT_BUILD_SCHEMA,
        mutates: false,
        run: (args) => this.parts.geometry.solidScriptPreview(args as unknown as GeometrySolidScriptArgs),
      },
      {
        name: 'geometry_script_build',
        description: `Builds solids from SolidScript block lines as CSG brushes and groups in one undo step. The easiest way to make rooms, doorways, stairs, arches and columns: no plane or clip math needed. ${SOLID_SCRIPT_REFERENCE_SUMMARY}`,
        inputSchema: MCP_GEOMETRY_SCRIPT_BUILD_SCHEMA,
        mutates: true,
        run: (args) => this.parts.geometry.solidScriptBuild(args as unknown as GeometrySolidScriptArgs),
      },
    ];
  }

  /**
   * Returns the tools that explain the SolidScript language and its commands.
   *
   * @returns Tools.
   */
  private referenceTools(): McpTool[] {
    return [
      {
        name: 'geometry_script_reference_get',
        description:
          'Returns the full SolidScript reference: coordinates and units, how block lines nest, values and formulas, every command with its fields, defaults and what stops it, examples and common mistakes. Read it before writing a script.',
        inputSchema: { type: 'object', properties: {} },
        mutates: false,
        run: () => this.script.reference(),
      },
      {
        name: 'geometry_script_command_list',
        description:
          'Lists the commands of the SolidScript editor palette: id, category, fields with hints and defaults, manual, what stops each, and an example line with how the editor lists it.',
        inputSchema: { type: 'object', properties: {} },
        mutates: false,
        run: () => this.script.commandList(),
      },
    ];
  }

  /**
   * Returns the tools of SolidScript generators, which keep a script in the
   * level and rebuild its brushes whenever the script or the box changes.
   *
   * @returns Tools.
   */
  private generatorTools(): McpTool[] {
    return [
      {
        name: 'geometry_script_generator_get',
        description:
          'Reads the script of a SolidScript generator: its name, block lines with values and how the editor lists each, placement, its Input lines with their values, group and whether they are shown, Input Note texts, solid count and first error.',
        inputSchema: MCP_GEOMETRY_SCRIPT_GET_SCHEMA,
        mutates: false,
        run: (args) => this.script.generatorGet(String(args['objectId'] ?? '')),
      },
      {
        name: 'geometry_script_generator_set',
        description:
          'Replaces the name, command lines, placement and input values of a SolidScript generator in one undo step; the generator rebuilds its brushes. Turn it into plain brushes with modifier_stack_bake.',
        inputSchema: MCP_GEOMETRY_SCRIPT_SET_SCHEMA,
        mutates: true,
        run: (args) => this.script.generatorSet(args as unknown as GeometryScriptGeneratorSetArgs),
      },
    ];
  }
}
