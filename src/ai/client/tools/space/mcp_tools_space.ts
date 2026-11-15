import type { McpTool } from '@/ai/client/tools/mcp_tool.js';
import { McpToolGroup } from '@/ai/client/tools/mcp_tool_group.js';
import type { EditorApiParts } from '@/ai/client/editor_api_parts.js';

import { MCP_SCHEMA_VECTOR3, MCP_SCHEMA_BOUNDS } from '@/ai/client/tools/mcp_tool_schema.js';
import type {
  ExplainCsgAtPointArgs,
  MeasureArgs,
  QueryNeighborsArgs,
  QueryOverlapsArgs,
  QueryPointArgs,
  QueryVoidConnectivityArgs,
} from '@/ai/client/editor_api_types.js';
/**
 * Spatial questions: what is at a point, overlaps, neighbors, distances, solid
 * or void.
 */
export class McpToolsSpace extends McpToolGroup {
  readonly category = 'space';
  readonly summary = 'Spatial questions: what is at a point, overlaps, neighbors, distances, solid or void.';

  /**
   * Creates the group.
   *
   * @param parts Editor API implementation parts.
   */
  constructor(private readonly parts: EditorApiParts) {
    super();
  }

  /**
   * Returns the space tools.
   *
   * @returns Tools.
   */
  tools(): McpTool[] {
    return [
      {
        name: 'space_point_query',
        description:
          'Brush volumes whose world AABB contains a point (NOT final CSG). Returns operation per hit. A subtractive hit does not mean the point is solid — call space_solid_point_explain for true solid|void.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Only this solid model.' },
            point: { ...MCP_SCHEMA_VECTOR3, description: 'World point to test.' },
          },
          required: ['point'],
        },
        mutates: false,
        run: (args) => this.parts.spatial.queryPoint(args as unknown as QueryPointArgs),
      },
      {
        name: 'space_solid_point_explain',
        description:
          'TRUE solid|void at a world point via ordered CSG (respects additive/subtractive/intersecting and invertedWorld). Prefer this over space_point_query/space_overlaps_query when placing doors or checking cavities.',
        inputSchema: {
          type: 'object',
          properties: {
            point: { ...MCP_SCHEMA_VECTOR3, description: 'World point to test.' },
            modelId: { type: 'string', description: 'Solid model to test; default all.' },
          },
          required: ['point'],
        },
        mutates: false,
        run: (args) => this.parts.csgQuery.explainCsgAtPoint(args as unknown as ExplainCsgAtPointArgs),
      },
      {
        name: 'space_overlaps_query',
        description:
          'AABB overlap of brush volumes (NOT final CSG solid). Returns brushIds + brushes[{brushId,name,operation}]. Subtractive hits mean cutter volumes overlap — not solid rock. For solid|void use space_solid_point_explain.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Only this solid model.' },
            brushId: { type: 'string', description: 'Use this brush bounds as the query box.' },
            bounds: { ...MCP_SCHEMA_BOUNDS, description: 'World box to test.' },
          },
        },
        mutates: false,
        run: (args) => this.parts.spatial.queryOverlaps(args as unknown as QueryOverlapsArgs),
      },
      {
        name: 'space_neighbors_query',
        description:
          'Nearest brush centers within radius. Returns rank, distance, name, operation, shape/kind. AABB/center based — not CSG solid. Optional limit for top N.',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string', description: 'Only this solid model.' },
            brushId: { type: 'string', description: 'Search around this brush center.' },
            point: { ...MCP_SCHEMA_VECTOR3, description: 'Search center when brushId is omitted.' },
            radius: { type: 'number', description: 'Search radius in meters around the brush center or point.' },
            limit: { type: 'number', description: 'Return only the nearest N neighbors.' },
          },
          required: ['radius'],
        },
        mutates: false,
        run: (args) => this.parts.spatial.queryNeighbors(args as unknown as QueryNeighborsArgs),
      },
      {
        name: 'space_distance_measure',
        description: 'Distance between brushes/points, or size of one brush.',
        inputSchema: {
          type: 'object',
          properties: {
            brushIdFrom: { type: 'string', description: 'First brush.' },
            brushIdTo: { type: 'string', description: 'Second brush.' },
            pointFrom: { ...MCP_SCHEMA_VECTOR3, description: 'First world point.' },
            pointTo: { ...MCP_SCHEMA_VECTOR3, description: 'Second world point.' },
            brushId: { type: 'string', description: 'Report the size of this brush.' },
          },
        },
        mutates: false,
        run: (args) => this.parts.spatial.measure(args as unknown as MeasureArgs),
      },
      {
        name: 'space_void_connectivity_query',
        description:
          'APPROXIMATE only: do two void points connect? Line sample then coarse grid BFS. Can miss thin gaps or report false negatives. Not a navmesh. Prefer space_solid_point_explain for single-point solid|void.',
        inputSchema: {
          type: 'object',
          properties: {
            pointFrom: { ...MCP_SCHEMA_VECTOR3, description: 'First world point.' },
            pointTo: { ...MCP_SCHEMA_VECTOR3, description: 'Second world point.' },
            modelId: { type: 'string', description: 'Solid model to test; default all.' },
          },
          required: ['pointFrom', 'pointTo'],
        },
        mutates: false,
        run: (args) => this.parts.csgQuery.queryVoidConnectivity(args as unknown as QueryVoidConnectivityArgs),
      },
    ];
  }
}
