import { CURVE_SECTION_CHOICES } from '@/curve/model/curve_section.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import type { CurveSegmentArgs, CurveTargetArgs } from '@/ai/client/modifier/editor_api_curve.js';
import type { McpToolSchema } from '@/ai/shared/mcp_tool_definition.js';
import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import {
  mcpArgumentNumber,
  mcpArgumentNumberOptional,
  mcpArgumentString,
} from '@/ai/client/tools/mcp_tool_arguments.js';

/** Curve coordinates shared by every curve tool description. */
const MCP_CURVE_UNITS =
  'Curve units: x runs 0..1 along the curve (for a column from base to top), y is the value 0..1 (for a column the radius share), y up.';

/** A 2D point in curve units. */
const MCP_SCHEMA_CURVE_POINT: McpToolSchema = {
  type: 'object',
  properties: {
    x: { type: 'number', description: 'Position 0..1.' },
    y: { type: 'number', description: 'Value 0..1.' },
  },
  required: ['x', 'y'],
};

/**
 * Builds a schema whose first properties name the curve.
 *
 * @param properties Further properties.
 * @param required Further required keys.
 * @param layered True adds the layer choice.
 * @returns Schema.
 */
function curveSchema(
  properties: Record<string, McpToolSchema>,
  required: string[] = [],
  layered = false,
): McpToolSchema {
  const target: Record<string, McpToolSchema> = {
    objectId: { type: 'string', description: 'Stack holder (generator node uuid, volume uuid, brush or group id).' },
    modifierId: { type: 'string', description: 'Modifier id from modifier_stack_get.' },
    key: {
      type: 'string',
      description: "Curve parameter key, for a column 'profile'; modifier_kind_list lists them (type curve).",
    },
  };
  if (layered)
    target['layer'] = {
      type: 'string',
      enum: ['primary', 'secondary'],
      description: 'secondary edits the -X line of custom-sided segments; default primary.',
    };
  return {
    type: 'object',
    properties: { ...target, ...properties },
    required: ['objectId', 'modifierId', 'key', ...required],
  };
}

/**
 * Reads the curve target arguments.
 *
 * @param args Tool arguments.
 * @returns Target.
 */
function curveTarget(args: Record<string, unknown>): CurveTargetArgs {
  const target: CurveTargetArgs = {
    objectId: mcpArgumentString(args, 'objectId'),
    modifierId: mcpArgumentString(args, 'modifierId'),
    key: mcpArgumentString(args, 'key'),
  };
  return typeof args['layer'] === 'string' ? { ...target, layer: args['layer'] } : target;
}

/**
 * Curves of modifier parameters (column profiles and the like): read, draw with
 * SVG path data, edit points, handles and segments, presets, markers.
 */
export class McpToolsCurve extends McpToolGroup {
  readonly category = 'curve';
  readonly summary =
    'Curves of modifier parameters (column profiles): read, SVG path, points, handles, segments, presets, markers.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the curve tools: reads, whole-curve writes, point and segment
   * edits, then markers and reflections.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [...this.wholeTools(), ...this.pointTools(), ...this.extraTools()];
  }

  /**
   * Returns the read and whole-curve tools.
   *
   * @returns Tools.
   */
  private wholeTools(): McpTool[] {
    const curve = this.parts.curve;
    return [
      {
        name: 'curve_get',
        description: `One curve: points with absolute handle positions, segments (segment i joins points i and i+1), markers and raw data. ${MCP_CURVE_UNITS}`,
        inputSchema: curveSchema({}),
        mutates: false,
        run: (args) => curve.curveGet(curveTarget(args)),
      },
      {
        name: 'curve_set',
        description: 'Replaces a whole curve with curve data as curve_get returns it in data.',
        inputSchema: curveSchema({ data: { type: 'object', description: 'Curve data {points, segments, ...}.' } }, [
          'data',
        ]),
        mutates: true,
        run: (args) => curve.curveSet(curveTarget(args), args['data']),
      },
      {
        name: 'curve_path_set',
        description: `Draws a curve line with SVG path data: M x y once, then L, H, V (straight), Q, T (quadratic) and C, S (cubic Bezier), lower case relative; Z is ignored. x must increase. Example: "M 0 0.6 L 0.15 0.6 C 0.25 0.6 0.25 0.4 0.35 0.4 L 1 0.4". ${MCP_CURVE_UNITS}`,
        inputSchema: curveSchema(
          { path: { type: 'string', description: 'SVG path data in curve units, y up.' } },
          ['path'],
          true,
        ),
        mutates: true,
        run: (args) => curve.pathSet(curveTarget(args), mcpArgumentString(args, 'path')),
      },
      {
        name: 'curve_preset_list',
        description: "Lists the curve parameter's presets (id, label, group, tooltip).",
        inputSchema: curveSchema({}),
        mutates: false,
        run: (args) => curve.presetList(curveTarget(args)),
      },
      {
        name: 'curve_preset_apply',
        description: 'Replaces the curve with a preset.',
        inputSchema: curveSchema({ presetId: { type: 'string', description: 'Preset id from curve_preset_list.' } }, [
          'presetId',
        ]),
        mutates: true,
        run: (args) => curve.presetApply(curveTarget(args), mcpArgumentString(args, 'presetId')),
      },
    ];
  }

  /**
   * Returns the point and segment tools.
   *
   * @returns Tools.
   */
  private pointTools(): McpTool[] {
    const curve = this.parts.curve;
    return [
      {
        name: 'curve_point_add',
        description: 'Inserts a point on the curve at x (keeping its shape), optionally moved to y.',
        inputSchema: curveSchema(
          {
            x: { type: 'number', description: 'Position 0..1 to insert at.' },
            y: { type: 'number', description: 'Optional new value 0..1.' },
          },
          ['x'],
          true,
        ),
        mutates: true,
        run: (args) =>
          curve.pointAdd(curveTarget(args), mcpArgumentNumber(args, 'x'), mcpArgumentNumberOptional(args, 'y')),
      },
      {
        name: 'curve_point_set',
        description:
          'Moves a point and/or its handles; handles are absolute positions as curve_get reports them. End points keep x 0 and 1.',
        inputSchema: curveSchema(
          {
            index: { type: 'integer', description: 'Point index from curve_get.' },
            x: { type: 'number', description: 'New position 0..1.' },
            y: { type: 'number', description: 'New value 0..1.' },
            handleIn: { ...MCP_SCHEMA_CURVE_POINT, description: 'Absolute incoming handle position.' },
            handleOut: { ...MCP_SCHEMA_CURVE_POINT, description: 'Absolute outgoing handle position.' },
          },
          ['index'],
          true,
        ),
        mutates: true,
        run: (args) =>
          curve.pointSet(curveTarget(args), mcpArgumentNumber(args, 'index'), args as { x?: number; y?: number }),
      },
      {
        name: 'curve_point_delete',
        description: 'Deletes an inner point.',
        inputSchema: curveSchema({ index: { type: 'integer', description: 'Inner point index.' } }, ['index'], true),
        mutates: true,
        run: (args) => curve.pointDelete(curveTarget(args), mcpArgumentNumber(args, 'index')),
      },
      {
        name: 'curve_segment_set',
        description:
          'Changes segments: mode (linear, quadratic, bezier), detail (steps), section (cross-section shape), side (mirror, negative, positive, custom), fixedDepth, blend and section properties (cornerSize, cornerSides, polygonSides, armWidth, armWidthEnd, straight, twist, rotation).',
        inputSchema: curveSchema(
          {
            indices: {
              type: 'array',
              items: { type: 'integer' },
              description: 'Segment indices; segment i joins points i and i+1.',
            },
            mode: { type: 'string', enum: ['linear', 'quadratic', 'bezier'], description: 'Bend mode.' },
            detail: { type: 'integer', description: 'Steps the segment is cut into.' },
            section: {
              type: 'string',
              enum: CURVE_SECTION_CHOICES.map((choice) => choice.value),
              description: 'Cross-section shape id as the Section menu lists it.',
            },
            side: {
              type: 'string',
              enum: ['mirror', 'negative', 'positive', 'custom'],
              description: 'Side the line shapes; custom adds a separate -X line.',
            },
            fixedDepth: { type: 'boolean', description: 'True keeps the depth fixed along the segment.' },
            blend: { type: 'boolean', description: 'True blends the section into its neighbours.' },
            properties: { type: 'object', description: 'Section property values by name.' },
          },
          ['indices'],
        ),
        mutates: true,
        run: (args) => curve.segmentSet(curveTarget(args), args as unknown as CurveSegmentArgs),
      },
    ];
  }

  /**
   * Returns the marker and reflection tools.
   *
   * @returns Tools.
   */
  private extraTools(): McpTool[] {
    const curve = this.parts.curve;
    return [
      {
        name: 'curve_marker_set',
        description:
          'Switches, moves or sizes the Base (bottom) or Top marker that splits a fixed-height base or top part off the curve.',
        inputSchema: curveSchema(
          {
            side: { type: 'string', enum: ['bottom', 'top'], description: 'bottom (Base) or top (Top).' },
            enabled: { type: 'boolean', description: 'Switches the marker on or off.' },
            x: { type: 'number', description: 'Place 0..1 along the curve.' },
            height: { type: 'number', description: 'Fixed height in meters.' },
          },
          ['side'],
        ),
        mutates: true,
        run: (args) =>
          curve.markerSet(
            curveTarget(args),
            mcpArgumentString(args, 'side'),
            args as { enabled?: boolean; x?: number; height?: number },
          ),
      },
      {
        name: 'curve_mirror',
        description: 'Mirrors the curve left to right (x becomes 1 - x).',
        inputSchema: curveSchema({}),
        mutates: true,
        run: (args) => curve.curveReflect(curveTarget(args), false),
      },
      {
        name: 'curve_flip',
        description: 'Flips the curve upside down (y becomes 1 - y).',
        inputSchema: curveSchema({}),
        mutates: true,
        run: (args) => curve.curveReflect(curveTarget(args), true),
      },
    ];
  }
}
