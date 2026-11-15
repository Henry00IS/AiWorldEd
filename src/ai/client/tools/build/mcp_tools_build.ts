import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

import {
  MCP_SCHEMA_OPERATION,
  MCP_SCHEMA_VECTOR3,
  MCP_SCHEMA_SNAP_PROPERTIES,
} from '@/ai/client/tools/mcp_tool_schema.js';
import type { AddOpeningArgs, AddRoomShellArgs, CutOpeningArgs, PlaceWallArgs } from '@/ai/client/editor_api_types.js';
/** Architectural helpers: walls, room shells, doors and windows. */
export class McpToolsBuild extends McpToolGroup {
  readonly category = 'build';
  readonly summary = 'Architectural helpers: walls, room shells, doors and windows.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the build tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'build_wall_place',
        description:
          'Vertical wall from {x,z}→{x,z}. size={thickness,height,length}; yaw aligns local +Z with the segment (atan2(dx,dz)). baseY is bottom (default 0); center Y = baseY+height/2. Axis-aligned openings need build_opening_add with targetBrushId.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            from: {
              description: 'Wall start point {x,z} on the floor plane.',
              type: 'object',
              properties: { x: { type: 'number' }, z: { type: 'number' } },
              required: ['x', 'z'],
            },
            to: {
              type: 'object',
              properties: { x: { type: 'number' }, z: { type: 'number' } },
              required: ['x', 'z'],
              description: 'Wall end point {x,z} on the floor plane.',
            },
            height: { type: 'number', description: 'Wall height in meters.' },
            thickness: { type: 'number', description: 'Wall thickness in meters.' },
            baseY: { type: 'number', description: 'Bottom of wall (default 0).' },
            operation: MCP_SCHEMA_OPERATION,
            name: {
              type: 'string',
              description: 'Display name shown in the outliner; stable names make brush_find easy.',
            },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['modelId', 'from', 'to', 'height', 'thickness'],
        },
        mutates: true,
        run: (args) => this.parts.builders.placeWall(args as unknown as PlaceWallArgs),
      },
      {
        name: 'build_room_shell_add',
        description:
          'Hollow room shell: floor + four wall panels + optional ceiling. size is exterior AABB; position is center (default y=size.y/2 so floor sits on 0). Walls already leave interior empty. interiorCarve (default true) adds a slight interior nibble cut. Names: {prefix}_wall_front (+Z), _back (-Z), _left (-X), _right (+X). Then use build_opening_add with targetBrushId on a wall.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            size: { ...MCP_SCHEMA_VECTOR3, description: 'Exterior width (x), full height (y), depth (z).' },
            position: { ...MCP_SCHEMA_VECTOR3, description: 'Room center. Default {0, size.y/2, 0}.' },
            wallThickness: { type: 'number', description: 'Wall thickness in meters.' },
            floorThickness: { type: 'number', description: 'Floor thickness in meters (default wallThickness).' },
            ceilingThickness: { type: 'number', description: '0 = no ceiling. Default = floor/wall thickness.' },
            interiorCarve: { type: 'boolean', description: 'Optional interior subtract (default true).' },
            name: { type: 'string', description: 'Name prefix for pieces (default "room").' },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['modelId', 'size', 'wallThickness'],
        },
        mutates: true,
        run: (args) => this.parts.builders.addRoomShell(args as unknown as AddRoomShellArgs),
      },
      {
        name: 'build_opening_add',
        description:
          'Door/window through an axis-aligned wall. STRONGLY prefer targetBrushId (wall brush): snaps cut to wall midplane, uses wall thickness as depth, reorders cut after that wall. position = opening center on the wall face (along-wall XZ + vertical); sillHeight = bottom Y of hole (overrides position.y). size {width,height,depth?}. wall front|back|left|right only sets thickness axis. Doors omit bottom frame strip. Frames default on; mullions default off.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            kind: { type: 'string', enum: ['window', 'door'], description: 'door or window.' },
            targetBrushId: {
              type: 'string',
              description: 'Wall brush to cut. Snaps midplane, depth, and CSG order after wall.',
            },
            wall: {
              type: 'string',
              enum: ['front', 'back', 'left', 'right'],
              description: 'Named side for thickness axis only (front=+Z). Prefer targetBrushId.',
            },
            axis: { type: 'string', enum: ['x', 'z'], description: 'Through-wall axis when wall omitted.' },
            position: {
              ...MCP_SCHEMA_VECTOR3,
              description: 'Opening center. With targetBrushId, through-wall coord is replaced by wall midplane.',
            },
            size: {
              type: 'object',
              description: 'Opening size in meters.',
              properties: {
                width: { type: 'number', description: 'Along-wall width.' },
                height: { type: 'number', description: 'Vertical height.' },
                depth: { type: 'number', description: 'Through-wall depth; default wall thickness.' },
              },
              required: ['width', 'height'],
            },
            wallThickness: { type: 'number', description: 'Depth fallback when size.depth and targetBrushId omit it.' },
            sillHeight: {
              type: 'number',
              description: 'Bottom Y of opening (door floor top or window sill). Sets center Y = sill + height/2.',
            },
            frameAdd: { type: 'boolean', description: 'Frame strips (default true). Doors skip bottom strip.' },
            mullionsAdd: { type: 'boolean', description: 'Center mullion (default false). Avoid for doors.' },
            name: {
              type: 'string',
              description: 'Display name shown in the outliner; stable names make brush_find easy.',
            },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['modelId', 'kind', 'position', 'size'],
        },
        mutates: true,
        run: (args) => this.parts.builders.addOpening(args as unknown as AddOpeningArgs),
      },
      {
        name: 'build_opening_cut',
        description:
          'Minimal subtractive hole. position = hole center; size = full {x,y,z} extents. Always subtractive. Does not snap to a wall — prefer build_opening_add with targetBrushId for doors/windows.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Solid model id from solid_model_list.' },
            position: { ...MCP_SCHEMA_VECTOR3, description: 'Center of the subtractive box.' },
            size: { ...MCP_SCHEMA_VECTOR3, description: 'Full extents through the wall on the thin axis.' },
            name: {
              type: 'string',
              description: 'Display name shown in the outliner; stable names make brush_find easy.',
            },
            ...MCP_SCHEMA_SNAP_PROPERTIES,
          },
          required: ['modelId', 'position', 'size'],
        },
        mutates: true,
        run: (args) => this.parts.builders.cutOpening(args as unknown as CutOpeningArgs),
      },
    ];
  }
}
