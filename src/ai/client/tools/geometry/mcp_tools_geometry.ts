import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import type { GeometrySolidScriptArgs } from '@/ai/client/editor_api_geometry.js';
import type { McpToolSchema } from '@/ai/shared/mcp_tool_definition.js';
import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import { MCP_SCHEMA_OPERATION, MCP_SCHEMA_VECTOR3 } from '@/ai/client/tools/mcp_tool_schema.js';

/** Short reference of the solid script language, shown in the tool description. */
const MCP_GEOMETRY_SCAD_SUBSET =
  'Solid script uses OpenSCAD-compatible syntax for this subset: cube(size, center), sphere(r|d), cylinder(h, r|d, r1, r2, d1, d2, center), polyhedron(points) (convex hull of the points), ' +
  'linear_extrude(height, center, scale) of square(size, center), circle(r|d) and polygon(points, paths) (concave outlines are split into convex pieces, extra paths become holes), ' +
  'hull(), union(), difference(), intersection(), translate, rotate([x,y,z]) or rotate(a, v), scale, mirror, multmatrix, color (ignored), ' +
  'variables, function and module definitions with children(), for, if/else, list comprehensions, ranges, math built-ins in degrees, echo(), assert(), $fn/$fa/$fs, and the * and % disable prefixes. ' +
  'Not supported: rotate_extrude, minkowski, offset, text, import, resize. ' +
  'Every primitive becomes one convex brush (a sphere or cylinder is a faceted hull; set $fn for the facet count). ' +
  'difference() becomes a CSG group whose first child is additive and the rest subtractive; intersection() a group of intersecting members; union() flattens. ' +
  'Module names become brush and group names, so wrap parts in modules (module door() ...) for readable outliner names. ' +
  "Units are editor meters; the script is Z-up and is converted to the editor's Y-up unless upAxis is 'y'.";

/** Input schema shared by build and preview. */
const MCP_GEOMETRY_SCAD_SCHEMA: McpToolSchema = {
  type: 'object',
  properties: {
    source: {
      type: 'string',
      description:
        'Solid script source text, for example "difference() { cube([4, 0.2, 3]); translate([1.5, -0.1, 0]) cube([1, 0.4, 2.1]); }".',
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

/**
 * Geometry languages: describe solids in an existing standard instead of
 * computing brush math.
 */
export class McpToolsGeometry extends McpToolGroup {
  readonly category = 'geometry';
  readonly summary =
    'Geometry languages: describe solids as a solid script and get ordered CSG brushes and groups in one undo step.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the geometry tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'geometry_script_preview',
        description: `Dry run of geometry_script_build: evaluates solid script source and returns the brush/group tree with operations and centers without changing the scene. ${MCP_GEOMETRY_SCAD_SUBSET}`,
        inputSchema: MCP_GEOMETRY_SCAD_SCHEMA,
        mutates: false,
        run: (args) => this.parts.geometry.solidScriptPreview(args as unknown as GeometrySolidScriptArgs),
      },
      {
        name: 'geometry_script_build',
        description: `Builds solids from solid script source as CSG brushes and groups in one undo step. The easiest way to make rooms, doorways, stairs, arches and columns: no plane or clip math needed. ${MCP_GEOMETRY_SCAD_SUBSET}`,
        inputSchema: MCP_GEOMETRY_SCAD_SCHEMA,
        mutates: true,
        run: (args) => this.parts.geometry.solidScriptBuild(args as unknown as GeometrySolidScriptArgs),
      },
    ];
  }
}
