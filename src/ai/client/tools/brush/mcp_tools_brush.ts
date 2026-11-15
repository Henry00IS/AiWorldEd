import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

import {
  MCP_SCHEMA_OPERATION,
  MCP_SCHEMA_VECTOR3,
  MCP_SCHEMA_BOUNDS,
  MCP_SCHEMA_SNAP_PROPERTIES,
} from '@/ai/client/tools/mcp_tool_schema.js';
import {
  mcpArgumentString,
  mcpArgumentStringOptional,
  mcpArgumentStringArray,
} from '@/ai/client/tools/mcp_tool_arguments.js';
import type {
  AddBoxBrushArgs,
  AddBoxBrushesArgs,
  AlignBrushArgs,
  DuplicateBrushesArgs,
  BatchSetBrushTransformArgs,
  ClipBrushArgs,
  FindBrushesArgs,
  MirrorBrushesArgs,
  PreviewNewBoxArgs,
  PreviewTransformArgs,
  RenameBrushArgs,
  ReorderBrushRelativeArgs,
  ReorderBrushesArgs,
  RotateBrushArgs,
  SetBrushTransformArgs,
  SplitBrushArgs,
} from '@/ai/client/editor_api_types.js';
/**
 * Convex brushes: read, find, create boxes, transform, clip, split, order,
 * delete.
 */
export class McpToolsBrush extends McpToolGroup {
  readonly category = 'brush';
  readonly summary = 'Convex brushes: read, find, create boxes, transform, clip, split, order, delete.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the brush tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'brush_get',
        description: 'One brush summary (includes parentGroupId), or full vertices/planes when detail=full.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
            },
            detail: {
              type: 'string',
              enum: ['summary', 'full'],
              description: 'summary (default) or full, which adds vertices and planes.',
            },
          },
          required: ['brushId'],
        },
        mutates: false,
        run: (args) =>
          this.parts.reads.getBrush(mcpArgumentString(args, 'brushId'), args['detail'] === 'full' ? 'full' : 'summary'),
      },
      {
        name: 'brush_find',
        description:
          'Filter brushes without dumping everything. Filters: nameContains, shape (thin|pole|tall|flat|panel|flag|long|box), heightMin/heightMax, region bounds, limit. Returns shape tags + summary per hit.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Only this solid model.' },
            nameContains: { type: 'string', description: 'Case-insensitive name substring, e.g. "flag".' },
            shape: {
              type: 'string',
              description: 'thin|pole|tall|flat|panel|flag|long|box|any',
            },
            heightMin: { type: 'number', description: 'Only brushes at least this tall (meters).' },
            heightMax: { type: 'number', description: 'Only brushes at most this tall (meters).' },
            region: { ...MCP_SCHEMA_BOUNDS, description: 'Only brushes whose world bounds overlap this box.' },
            limit: { type: 'number', description: 'Return at most this many results.' },
          },
        },
        mutates: false,
        run: (args) => this.parts.find.findBrushes(args as unknown as FindBrushesArgs),
      },
      {
        name: 'brush_describe',
        description:
          'One-line human summary: kind (thin vertical pole, flat panel/flag), approx size and center. Faster than reading localBounds/scale.',
        inputSchema: {
          type: 'object',
          properties: { brushId: { type: 'string', description: 'Brush id.' } },
          required: ['brushId'],
        },
        mutates: false,
        run: (args) => this.parts.find.describeBrush(mcpArgumentString(args, 'brushId')),
      },
      {
        name: 'brush_extents_get',
        description:
          'Half-size (halfExtents), full size, center, bounds, and six face centers (plusX/minusX/plusY/minusY/plusZ/minusZ) for alignment math without hand-halving AABBs.',
        inputSchema: {
          type: 'object',
          properties: { brushId: { type: 'string', description: 'Brush id.' } },
          required: ['brushId'],
        },
        mutates: false,
        run: (args) => this.parts.spatial.halfExtents(mcpArgumentString(args, 'brushId')),
      },
      {
        name: 'brush_bounds_get',
        description: 'World AABB for one brush or all brushes (optional model filter).',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Only this solid model.' },
            brushId: { type: 'string', description: 'One brush; omit for all brushes.' },
          },
        },
        mutates: false,
        run: (args) =>
          this.parts.spatial.queryBrushBounds(
            mcpArgumentStringOptional(args, 'modelId'),
            mcpArgumentStringOptional(args, 'brushId'),
          ),
      },
      {
        name: 'brush_validate',
        description: 'Validate convex brush topology for one brush.',
        inputSchema: {
          type: 'object',
          properties: { brushId: { type: 'string', description: 'Brush id.' } },
          required: ['brushId'],
        },
        mutates: false,
        run: (args) => this.parts.validation.validateBrush(mcpArgumentString(args, 'brushId')),
      },
      {
        name: 'brush_box_preview',
        description:
          'Dry-run create: same TRS fields as brush_box_add but does not create. Returns predicted worldBounds, center, worldSize. Use before committing geometry.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            size: {
              oneOf: [{ type: 'number' }, MCP_SCHEMA_VECTOR3],
              description: 'Full size in meters: one number for a cube, or {x,y,z}.',
              description: 'Full size in meters: one number for a cube or {x,y,z}.',
            },
            position: { ...MCP_SCHEMA_VECTOR3, description: 'Local position (center) in meters.' },
            rotationDegrees: { ...MCP_SCHEMA_VECTOR3, description: 'Local rotation in degrees (XYZ order).' },
            scale: { ...MCP_SCHEMA_VECTOR3, description: 'Local scale per axis (1 = unchanged).' },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['modelId'],
        },
        mutates: false,
        run: (args) => this.parts.builders.previewNewBox(args as unknown as PreviewNewBoxArgs),
      },
      {
        name: 'brush_transform_preview',
        description:
          'Dry-run: predicted world bounds/size/center for a proposed position/rotationDegrees/scale without applying. Check "touches pole?" before commit. Supports snap:false.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
            },
            position: { ...MCP_SCHEMA_VECTOR3, description: 'Local position (center) in meters.' },
            rotationDegrees: { ...MCP_SCHEMA_VECTOR3, description: 'Local rotation in degrees (XYZ order).' },
            scale: { ...MCP_SCHEMA_VECTOR3, description: 'Local scale per axis (1 = unchanged).' },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['brushId'],
        },
        mutates: false,
        run: (args) => this.parts.align.previewTransform(args as unknown as PreviewTransformArgs),
      },
      {
        name: 'brush_box_add',
        description:
          'Add a convex box brush. Model-local, right-handed Y-up. Use rotationDegrees (not radians). Optional name. Optional parentGroupId to nest under a solid CSG group. Snaps unless snap:false or exact:true. operation: additive|subtractive|intersecting.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            size: {
              oneOf: [{ type: 'number' }, MCP_SCHEMA_VECTOR3],
              description: 'Full size in meters: one number for a cube, or {x,y,z}.',
            },
            position: { ...MCP_SCHEMA_VECTOR3, description: 'Local position (center) in meters.' },
            rotationDegrees: { ...MCP_SCHEMA_VECTOR3, description: 'Local rotation in degrees (XYZ order).' },
            scale: { ...MCP_SCHEMA_VECTOR3, description: 'Local scale per axis (1 = unchanged).' },
            operation: MCP_SCHEMA_OPERATION,
            name: { type: 'string', description: 'Stable display name, e.g. path_north or def_pad_nw.' },
            parentGroupId: {
              type: 'string',
              description: 'Solid CSG group uuid; omit to parent under the solid model root.',
            },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['modelId'],
        },
        mutates: true,
        run: (args) => this.parts.writes.addBoxBrush(args as unknown as AddBoxBrushArgs),
      },
      {
        name: 'brush_boxes_add',
        description:
          'Batch create many box brushes. Per entry: size/position/rotationDegrees/scale/operation/name/parentGroupId plus optional nameAfter|nameBefore|brushIdAfter|brushIdBefore for CSG order.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            brushes: {
              type: 'array',
              description:
                'Boxes to create in order; each entry takes the brush_box_add fields plus optional CSG order (nameAfter, nameBefore, brushIdAfter, brushIdBefore).',
              items: {
                type: 'object',
                properties: {
                  size: {
                    oneOf: [{ type: 'number' }, MCP_SCHEMA_VECTOR3],
                    description: 'Full size in meters: one number for a cube, or {x,y,z}.',
                    description: 'Full size in meters: one number for a cube or {x,y,z}.',
                  },
                  position: { ...MCP_SCHEMA_VECTOR3, description: 'Local position (center) in meters.' },
                  rotationDegrees: { ...MCP_SCHEMA_VECTOR3, description: 'Local rotation in degrees (XYZ order).' },
                  scale: { ...MCP_SCHEMA_VECTOR3, description: 'Local scale per axis (1 = unchanged).' },
                  operation: MCP_SCHEMA_OPERATION,
                  name: {
                    type: 'string',
                    description: 'Display name shown in the outliner; stable names make brush_find easy.',
                  },
                  parentGroupId: {
                    type: 'string',
                    description: 'CSG group to nest under; omit for the solid model root.',
                  },
                  nameAfter: { type: 'string', description: 'Insert after the brush with this name in CSG order.' },
                  nameBefore: { type: 'string', description: 'Insert before the brush with this name in CSG order.' },
                  brushIdAfter: { type: 'string', description: 'Insert after this brush in CSG order.' },
                  brushIdBefore: { type: 'string', description: 'Insert before this brush in CSG order.' },
                },
              },
            },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['modelId', 'brushes'],
        },
        mutates: true,
        run: (args) => this.parts.writes.addBoxBrushes(args as unknown as AddBoxBrushesArgs),
      },
      {
        name: 'brush_duplicate',
        description:
          'Duplicate brushes and/or solid CSG groups (groupIds clones the whole nested compound). createdIds are brush ids only; data.groupIds has new group uuids. Optional local offset (default +1 on X). Optional mirrorAxis x|z + mirrorPlane after copy.',
        inputSchema: {
          type: 'object',
          properties: {
            brushIds: { type: 'array', items: { type: 'string' }, description: 'Brushes to copy.' },
            groupIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Solid CSG group uuids to clone with nested children.',
            },
            offset: { ...MCP_SCHEMA_VECTOR3, description: 'Local offset of the copies (default +1 on X).' },
            mirrorAxis: { type: 'string', enum: ['x', 'z'], description: 'Mirror the copies across this world axis.' },
            mirrorPlane: { type: 'number', description: 'Mirror plane coordinate on mirrorAxis (default 0).' },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
        },
        mutates: true,
        run: (args) => this.parts.writes.duplicateBrushes(args as unknown as DuplicateBrushesArgs),
      },
      {
        name: 'brush_mirror',
        description:
          'Mirror across X or Z. Position reflects through plane; yaw becomes -yaw (X) or π-yaw (Z). copy:true (default) duplicates then mirrors; copy:false moves in place. plane is the axis coordinate (default 0).',
        inputSchema: {
          type: 'object',
          properties: {
            brushIds: { type: 'array', items: { type: 'string' }, description: 'Brushes to mirror.' },
            axis: { type: 'string', enum: ['x', 'z'], description: 'World axis to mirror across.' },
            plane: { type: 'number', description: 'Plane coordinate on the chosen axis (default 0).' },
            copy: { type: 'boolean', description: 'True (default) mirrors a copy; false mirrors in place.' },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['brushIds', 'axis'],
        },
        mutates: true,
        run: (args) => this.parts.writes.mirrorBrushes(args as unknown as MirrorBrushesArgs),
      },
      {
        name: 'brush_operation_set',
        description: 'Set CSG operation on brushes.',
        inputSchema: {
          type: 'object',
          properties: {
            brushIds: { type: 'array', items: { type: 'string' }, description: 'Brushes to change.' },
            operation: MCP_SCHEMA_OPERATION,
          },
          required: ['brushIds', 'operation'],
        },
        mutates: true,
        run: (args) =>
          this.parts.writes.setBrushOperation(
            mcpArgumentStringArray(args, 'brushIds'),
            mcpArgumentString(args, 'operation'),
          ),
      },
      {
        name: 'brush_transform_set',
        description:
          'Set brush local position / rotationDegrees / scale (any subset). Snaps when snap is on. Pass snap:false or exact:true to bypass snap (e.g. keep -17.125). Returns applied transform with rotationDegrees.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
            },
            position: { ...MCP_SCHEMA_VECTOR3, description: 'Local position (center) in meters.' },
            rotationDegrees: { ...MCP_SCHEMA_VECTOR3, description: 'Local rotation in degrees (XYZ order).' },
            scale: { ...MCP_SCHEMA_VECTOR3, description: 'Local scale per axis (1 = unchanged).' },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['brushId'],
        },
        mutates: true,
        run: (args) => this.parts.writes.setBrushTransform(args as unknown as SetBrushTransformArgs),
      },
      {
        name: 'brush_transforms_set',
        description:
          'Move/rotate/scale several brushes in one call. transforms[] entries match brush_transform_set fields. Optional top-level snap/exact default for all entries.',
        inputSchema: {
          type: 'object',
          properties: {
            transforms: {
              type: 'array',
              description: 'One entry per brush: brushId plus any of position, rotationDegrees, scale, snap, exact.',
              items: {
                type: 'object',
                properties: {
                  brushId: {
                    type: 'string',
                    description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
                  },
                  position: { ...MCP_SCHEMA_VECTOR3, description: 'Local position (center) in meters.' },
                  rotationDegrees: { ...MCP_SCHEMA_VECTOR3, description: 'Local rotation in degrees (XYZ order).' },
                  scale: { ...MCP_SCHEMA_VECTOR3, description: 'Local scale per axis (1 = unchanged).' },
                  ...MCP_SCHEMA_SNAP_PROPERTIES,
                },
                required: ['brushId'],
              },
            },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['transforms'],
        },
        mutates: true,
        run: (args) => this.parts.writes.batchSetBrushTransform(args as unknown as BatchSetBrushTransformArgs),
      },
      {
        name: 'brush_align',
        description:
          'Attach brushId to targetBrushId without hand-computing half-widths. mode "top" = stack on target top; "bottom" = hang under; "side" = touch on axis x|z (direction 1|-1). gap between faces (default 0). center free axes (default true). Supports snap:false.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: { type: 'string', description: 'Brush to move.' },
            targetBrushId: { type: 'string', description: 'Anchor brush.' },
            mode: {
              type: 'string',
              enum: ['top', 'bottom', 'side'],
              description: 'top stacks on the target, bottom hangs below it, side touches it along axis.',
            },
            axis: { type: 'string', enum: ['x', 'z'], description: 'For mode side.' },
            direction: { type: 'number', description: 'For mode side: 1 = +axis face, -1 = -axis face.' },
            gap: { type: 'number', description: 'Distance between the touching faces (default 0).' },
            center: {
              type: 'boolean',
              description: 'True (default) centers the brush on the target along the free axes.',
            },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['brushId', 'targetBrushId', 'mode'],
        },
        mutates: true,
        run: (args) => this.parts.align.alignBrush(args as unknown as AlignBrushArgs),
      },
      {
        name: 'brush_rotate',
        description:
          'Simple brush rotate in degrees. Default axis y (yaw). Relative unless absolute=true. Uses rotation snap when snap is on unless snap:false. Prefer this over raw Euler for turns.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
            },
            degrees: { type: 'number', description: 'Angle in degrees.' },
            axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'Rotation axis (default y, yaw).' },
            absolute: {
              type: 'boolean',
              description: 'True sets the angle; false (default) adds to the current angle.',
            },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['brushId', 'degrees'],
        },
        mutates: true,
        run: (args) => this.parts.writes.rotateBrush(args as unknown as RotateBrushArgs),
      },
      {
        name: 'brush_rename',
        description:
          'Set a stable display name (e.g. start_a_flag, path_north, def_pad_nw) so brush_find can locate pieces without hunting UUIDs. Undoable.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
            },
            name: { type: 'string', description: 'New display name.' },
          },
          required: ['brushId', 'name'],
        },
        mutates: true,
        run: (args) => this.parts.writes.renameBrush(args as unknown as RenameBrushArgs),
      },
      {
        name: 'brush_clip',
        description:
          'Plane-clip ONE brush topology (not CSG subtract). Plane is WORLD-space: axis+distance (e.g. cut at world x=distance), or point+normal, or three points. frontKeep (default true) keeps +axis/normal side. Use for bevels/ramps on a single brush; prefer build_opening_add/build_opening_cut for doors in walls. Undoable.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
            },
            axis: {
              type: 'string',
              enum: ['x', 'y', 'z'],
              description: 'Clip plane perpendicular to this world axis, at distance.',
            },
            distance: { type: 'number', description: 'World coordinate of axis-aligned plane.' },
            point: { ...MCP_SCHEMA_VECTOR3, description: 'Point on the clip plane (world), used with normal.' },
            normal: { ...MCP_SCHEMA_VECTOR3, description: 'Plane normal (world), used with point.' },
            pointA: { ...MCP_SCHEMA_VECTOR3, description: 'First point of a three-point plane (world).' },
            pointB: { ...MCP_SCHEMA_VECTOR3, description: 'Second point of a three-point plane (world).' },
            pointC: { ...MCP_SCHEMA_VECTOR3, description: 'Third point of a three-point plane (world).' },
            frontKeep: {
              type: 'boolean',
              description: 'True (default) keeps the side the plane normal or +axis points to.',
            },
          },
          required: ['brushId'],
        },
        mutates: true,
        run: (args) => this.parts.writes.clipBrush(args as unknown as ClipBrushArgs),
      },
      {
        name: 'brush_split',
        description:
          'Split ONE brush into two along a WORLD plane (same plane args as brush_clip). Replaces source with two pieces. Prefer for permanent geometry splits, not door holes (use build_opening_add). Undoable.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
            },
            axis: {
              type: 'string',
              enum: ['x', 'y', 'z'],
              description: 'Split plane perpendicular to this world axis, at distance.',
            },
            distance: { type: 'number', description: 'World coordinate of axis-aligned plane.' },
            point: { ...MCP_SCHEMA_VECTOR3, description: 'Point on the split plane (world), used with normal.' },
            normal: { ...MCP_SCHEMA_VECTOR3, description: 'Plane normal (world), used with point.' },
            pointA: { ...MCP_SCHEMA_VECTOR3, description: 'First point of a three-point plane (world).' },
            pointB: { ...MCP_SCHEMA_VECTOR3, description: 'Second point of a three-point plane (world).' },
            pointC: { ...MCP_SCHEMA_VECTOR3, description: 'Third point of a three-point plane (world).' },
          },
          required: ['brushId'],
        },
        mutates: true,
        run: (args) => this.parts.writes.splitBrush(args as unknown as SplitBrushArgs),
      },
      {
        name: 'brush_reorder',
        description:
          'Move brushes and/or solid CSG groups to first or last among siblings under their own parent (outliner To First/Last). Nested groups reorder inside their parent only.',
        inputSchema: {
          type: 'object',
          properties: {
            brushIds: { type: 'array', items: { type: 'string' }, description: 'Brushes to move.' },
            groupIds: { type: 'array', items: { type: 'string' }, description: 'CSG groups to move.' },
            end: {
              type: 'string',
              enum: ['first', 'last'],
              description: 'first or last among siblings (CSG evaluation order).',
            },
          },
          required: ['end'],
        },
        mutates: true,
        run: (args) => this.parts.writes.reorderBrushes(args as unknown as ReorderBrushesArgs),
      },
      {
        name: 'brush_reorder_relative',
        description:
          'Move one brush before or after another (by brushIdRelative or nameRelative). placement: before|after. Undoable. Prefer over first/last when inserting a cut after a wall.',
        inputSchema: {
          type: 'object',
          properties: {
            brushId: {
              type: 'string',
              description: 'Brush id from brush_find, scene_hierarchy_get or a created result.',
            },
            brushIdRelative: { type: 'string', description: 'Reference brush id.' },
            nameRelative: {
              type: 'string',
              description: 'Reference brush name, used when brushIdRelative is omitted.',
            },
            placement: {
              type: 'string',
              enum: ['before', 'after'],
              description: 'before or after the reference brush in CSG order.',
            },
          },
          required: ['brushId', 'placement'],
        },
        mutates: true,
        run: (args) => this.parts.writes.reorderBrushRelative(args as unknown as ReorderBrushRelativeArgs),
      },
      {
        name: 'brush_delete',
        description: 'Delete brushes by id (undoable).',
        inputSchema: {
          type: 'object',
          properties: { brushIds: { type: 'array', items: { type: 'string' }, description: 'Brushes to delete.' } },
          required: ['brushIds'],
        },
        mutates: true,
        run: (args) => this.parts.writes.deleteBrushes(mcpArgumentStringArray(args, 'brushIds')),
      },
    ];
  }
}
