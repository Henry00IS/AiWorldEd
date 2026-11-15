import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';
import type { TextureFacesArgs } from '@/ai/client/texture/editor_api_texture.js';
import type { McpToolSchema } from '@/ai/shared/mcp_tool_definition.js';
import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import {
  mcpArgumentNumber,
  mcpArgumentString,
  mcpArgumentStringArray,
  mcpArgumentStringOptional,
} from '@/ai/client/tools/mcp_tool_arguments.js';
import type { FaceTextureAlign, FaceTextureMappingTrs } from '@/texture/uv/face_texture_mapping.js';

/** UV fields texture_uv_set writes. */
const MCP_TEXTURE_UV_FIELDS: readonly (keyof FaceTextureMappingTrs)[] = [
  'scaleU',
  'scaleV',
  'offsetU',
  'offsetV',
  'rotationDeg',
];

/**
 * Builds a schema whose first properties pick brush faces.
 *
 * @param properties Further properties.
 * @param required Further required keys.
 * @returns Schema.
 */
function textureFacesSchema(properties: Record<string, McpToolSchema>, required: string[] = []): McpToolSchema {
  return {
    type: 'object',
    properties: {
      brushIds: { type: 'array', items: { type: 'string' }, description: 'Brush ids.' },
      surfaceIndices: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Face indices from texture_face_list; omit for every face.',
      },
      ...properties,
    },
    required: ['brushIds', ...required],
  };
}

/**
 * Reads the face arguments.
 *
 * @param args Tool arguments.
 * @returns Faces.
 */
function textureFaces(args: Record<string, unknown>): TextureFacesArgs {
  const brushIds = mcpArgumentStringArray(args, 'brushIds');
  const surfaces = args['surfaceIndices'];
  return Array.isArray(surfaces) ? { brushIds, surfaceIndices: surfaces.map(Number) } : { brushIds };
}

/**
 * Reads the axis argument.
 *
 * @param args Tool arguments.
 * @returns U or v.
 */
function textureAxis(args: Record<string, unknown>): 'u' | 'v' {
  const axis = mcpArgumentString(args, 'axis');
  if (axis !== 'u' && axis !== 'v') throw new Error("axis must be 'u' or 'v'");
  return axis;
}

/** Axis argument of the relative UV tools. */
const MCP_SCHEMA_TEXTURE_AXIS: McpToolSchema = { type: 'string', enum: ['u', 'v'], description: 'Texture axis.' };

/**
 * Textures and UVs of brush faces, as the texture browser and UV editor offer
 * them.
 */
export class McpToolsTexture extends McpToolGroup {
  readonly category = 'texture';
  readonly summary =
    'Textures and UVs: list textures, read brush faces, assign textures, set, align, scale, offset, rotate and reset UVs.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the texture tools: reads, assignment, then UV edits.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [...this.readTools(), ...this.uvTools(), ...this.uvStepTools()];
  }

  /**
   * Returns the read and assignment tools.
   *
   * @returns Tools.
   */
  private readTools(): McpTool[] {
    const texture = this.parts.texture;
    return [
      {
        name: 'texture_list',
        description:
          'Lists texture ids and labels in the texture library, plus textures the level uses whose files are missing.',
        inputSchema: {
          type: 'object',
          properties: { filter: { type: 'string', description: 'Text the id or label contains.' } },
        },
        mutates: false,
        run: (args) => texture.textureList(mcpArgumentStringOptional(args, 'filter')),
      },
      {
        name: 'texture_face_list',
        description:
          "Lists a brush's faces: surfaceIndex, world normal and center, visible in the built result, textureId, align and UV fields.",
        inputSchema: {
          type: 'object',
          properties: { brushId: { type: 'string', description: 'Brush id.' } },
          required: ['brushId'],
        },
        mutates: false,
        run: (args) => texture.faceList(mcpArgumentString(args, 'brushId')),
      },
      {
        name: 'texture_face_assign',
        description: 'Assigns a texture to brush faces (all faces when surfaceIndices is omitted); UVs stay.',
        inputSchema: textureFacesSchema(
          { textureId: { type: 'string', description: 'Texture id from texture_list.' } },
          ['textureId'],
        ),
        mutates: true,
        run: (args) => texture.faceAssign(textureFaces(args), mcpArgumentString(args, 'textureId')),
      },
    ];
  }

  /**
   * Returns the absolute UV tools.
   *
   * @returns Tools.
   */
  private uvTools(): McpTool[] {
    const texture = this.parts.texture;
    const number = (description: string): McpToolSchema => ({ type: 'number', description });
    return [
      {
        name: 'texture_uv_set',
        description:
          'Sets UV fields on brush faces; only the given fields change. Scale is texture size in meters per tile.',
        inputSchema: textureFacesSchema({
          scaleU: number('U scale.'),
          scaleV: number('V scale.'),
          offsetU: number('U offset in meters (one tile at scale 1).'),
          offsetV: number('V offset in meters.'),
          rotationDeg: number('Rotation in degrees.'),
        }),
        mutates: true,
        run: (args) =>
          texture.uvSet(
            textureFaces(args),
            Object.fromEntries(
              MCP_TEXTURE_UV_FIELDS.filter((key) => typeof args[key] === 'number').map((key) => [
                key,
                args[key] as number,
              ]),
            ),
          ),
      },
      {
        name: 'texture_uv_align',
        description:
          'Projects UVs like the UV editor align buttons: floor, wall, ceiling, face or auto. Scale, offset and rotation stay.',
        inputSchema: textureFacesSchema(
          { align: { type: 'string', enum: ['floor', 'wall', 'ceiling', 'face', 'auto'], description: 'Projection.' } },
          ['align'],
        ),
        mutates: true,
        run: (args) =>
          texture.uvApply(
            textureFaces(args),
            { alignOnly: mcpArgumentString(args, 'align') as FaceTextureAlign },
            'Aligned UVs',
          ),
      },
      {
        name: 'texture_uv_reset',
        description: 'Resets UVs to the default projection; textures stay.',
        inputSchema: textureFacesSchema({}),
        mutates: true,
        run: (args) => texture.uvApply(textureFaces(args), { resetUvOnly: true }, 'Reset UVs'),
      },
    ];
  }

  /**
   * Returns the relative UV tools, one per UV editor button row.
   *
   * @returns Tools.
   */
  private uvStepTools(): McpTool[] {
    const texture = this.parts.texture;
    return [
      {
        name: 'texture_uv_scale',
        description: 'Multiplies the U or V scale of each face (2 doubles the tile size).',
        inputSchema: textureFacesSchema(
          { axis: MCP_SCHEMA_TEXTURE_AXIS, factor: { type: 'number', description: 'Factor.' } },
          ['axis', 'factor'],
        ),
        mutates: true,
        run: (args) =>
          texture.uvApply(
            textureFaces(args),
            {
              relativeOp: { kind: 'multiplyScale', axis: textureAxis(args), factor: mcpArgumentNumber(args, 'factor') },
            },
            'Scaled UVs',
          ),
      },
      {
        name: 'texture_uv_offset',
        description: 'Shifts the U or V offset of each face by meters (0.25 is a quarter tile at scale 1).',
        inputSchema: textureFacesSchema(
          { axis: MCP_SCHEMA_TEXTURE_AXIS, delta: { type: 'number', description: 'Meters to shift.' } },
          ['axis', 'delta'],
        ),
        mutates: true,
        run: (args) =>
          texture.uvApply(
            textureFaces(args),
            { relativeOp: { kind: 'addOffset', axis: textureAxis(args), delta: mcpArgumentNumber(args, 'delta') } },
            'Shifted UVs',
          ),
      },
      {
        name: 'texture_uv_rotate',
        description: 'Rotates the UVs of each face by degrees.',
        inputSchema: textureFacesSchema({ degrees: { type: 'number', description: 'Degrees to add.' } }, ['degrees']),
        mutates: true,
        run: (args) =>
          texture.uvApply(
            textureFaces(args),
            { relativeOp: { kind: 'addRotation', degrees: mcpArgumentNumber(args, 'degrees') } },
            'Rotated UVs',
          ),
      },
    ];
  }
}
