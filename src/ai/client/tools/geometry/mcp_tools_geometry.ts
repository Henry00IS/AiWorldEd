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

/** Input schema shared by build and preview. */
const MCP_GEOMETRY_SCRIPT_SOURCE_SCHEMA: McpToolSchema = {
  type: 'object',
  properties: {
    source: {
      type: 'string',
      description:
        'SolidScript source text, for example "difference() { cube([4, 0.2, 3]); translate([1.5, -0.1, 0]) cube([1, 0.4, 2.1]); }".',
    },
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
    upAxis: {
      type: 'string',
      enum: ['z', 'y'],
      description: "'z' (default) treats the source as Z-up; 'y' keeps the editor's Y-up axes as written.",
    },
  },
  required: ['source'],
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
      type: 'array',
      description:
        'New script as command lines, exactly like the script editor palette: there are no free code lines. Commands that open a block need a later {command: "end"}; {command: "blank"} is an empty line.',
      items: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command id from geometry_script_command_list.' },
          values: {
            type: 'object',
            description:
              'Code text by parameter key, always strings such as "2", "[1, 2, 3]", "true" or "width * 2"; missing keys keep their defaults.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['command'],
      },
    },
    placement: {
      type: 'string',
      enum: ['origin', 'fit', 'stretch'],
      description:
        "'origin' keeps script units at the box's bottom centre, 'fit' scales uniformly into the box, 'stretch' fills it.",
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
   * Returns the tools that evaluate SolidScript source into brushes.
   *
   * @returns Tools.
   */
  private buildTools(): McpTool[] {
    return [
      {
        name: 'geometry_script_preview',
        description: `Dry run of geometry_script_build: evaluates SolidScript source and returns the brush/group tree with operations and centers without changing the scene. ${SOLID_SCRIPT_REFERENCE_SUMMARY}`,
        inputSchema: MCP_GEOMETRY_SCRIPT_SOURCE_SCHEMA,
        mutates: false,
        run: (args) => this.parts.geometry.solidScriptPreview(args as unknown as GeometrySolidScriptArgs),
      },
      {
        name: 'geometry_script_build',
        description: `Builds solids from SolidScript source as CSG brushes and groups in one undo step. The easiest way to make rooms, doorways, stairs, arches and columns: no plane or clip math needed. ${SOLID_SCRIPT_REFERENCE_SUMMARY}`,
        inputSchema: MCP_GEOMETRY_SCRIPT_SOURCE_SCHEMA,
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
          'Returns the full SolidScript reference: coordinates and units, grammar, every shape, transform and editor command with parameters and defaults, what is not supported, examples and common mistakes. Read it before writing a script.',
        inputSchema: { type: 'object', properties: {} },
        mutates: false,
        run: () => this.script.reference(),
      },
      {
        name: 'geometry_script_command_list',
        description:
          'Lists the command lines of the SolidScript editor palette: id, category, values with hints, and the code each writes.',
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
          'Reads the script of a SolidScript generator: its name, command lines with values, the generated source, placement, solid count and first error.',
        inputSchema: MCP_GEOMETRY_SCRIPT_GET_SCHEMA,
        mutates: false,
        run: (args) => this.script.generatorGet(String(args['objectId'] ?? '')),
      },
      {
        name: 'geometry_script_generator_set',
        description:
          'Replaces the name, command lines and placement of a SolidScript generator in one undo step; the generator rebuilds its brushes. Turn it into plain brushes with modifier_stack_bake.',
        inputSchema: MCP_GEOMETRY_SCRIPT_SET_SCHEMA,
        mutates: true,
        run: (args) => this.script.generatorSet(args as unknown as GeometryScriptGeneratorSetArgs),
      },
    ];
  }
}
