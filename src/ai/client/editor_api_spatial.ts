import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type { MeasureArgs, QueryNeighborsArgs, QueryOverlapsArgs, QueryPointArgs } from './editor_api_types.js';
import {
  boundsCenter,
  boxToDto,
  computeBrushWorldBounds,
  distanceSquared,
  dtoToBox,
  dtoToVec3,
  vec3ToDto,
} from './editor_api_math.js';
import { findBrush, findSolidModel, listSolidModels } from './editor_api_lookup.js';
import { solidOperationToName } from './editor_api_operations.js';
import { classifyBrushShape } from './editor_api_shape.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { McpBounds, McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/**
 * Note returned with AABB-only spatial tools so AIs do not treat cutters as
 * solid.
 */
const AABB_ONLY_NOTE =
  'AABB brush volumes only (not final CSG solid). Subtractive brushes still hit when their volume contains/overlaps the query — they do not mean solid rock. Use space_solid_point_explain for true solid|void.';

/** Neighbor hit row with rankable distance and shape tags. */
interface NeighborHitRow {
  brushId: string;
  name: string;
  operation: string;
  distance: number;
  shape: string;
  kind: string;
  size: { x: number; y: number; z: number };
}

/** One brush hit from an AABB spatial query. */
interface AabbBrushHit {
  brushId: string;
  name: string;
  operation: string;
  modelId: string;
}

/** Spatial query helpers over live solid brush bounds. */
export class EditorApiSpatial {
  private readonly host: EditorApiHost;

  /**
   * Creates spatial helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Returns half-extents and face centers for alignment math.
   *
   * @param brushId Brush id.
   * @returns Half size, full size, center, and six face centers.
   */
  halfExtents(brushId: string): McpToolResult {
    const found = findBrush(this.host.worldObject, brushId);
    if (!found) return fail(`Brush not found: ${brushId}`);
    const bounds = computeBrushWorldBounds(found.model, found.brush);
    if (bounds.isEmpty()) return fail('Brush has empty bounds');
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const half = size.clone().multiplyScalar(0.5);
    return ok('Half extents', {
      brushId,
      name: found.brush.name,
      size: vec3ToDto(size),
      halfExtents: vec3ToDto(half),
      center: vec3ToDto(center),
      bounds: boxToDto(bounds),
      faceCenters: {
        plusX: vec3ToDto(new THREE.Vector3(bounds.max.x, center.y, center.z)),
        minusX: vec3ToDto(new THREE.Vector3(bounds.min.x, center.y, center.z)),
        plusY: vec3ToDto(new THREE.Vector3(center.x, bounds.max.y, center.z)),
        minusY: vec3ToDto(new THREE.Vector3(center.x, bounds.min.y, center.z)),
        plusZ: vec3ToDto(new THREE.Vector3(center.x, center.y, bounds.max.z)),
        minusZ: vec3ToDto(new THREE.Vector3(center.x, center.y, bounds.min.z)),
      },
    });
  }

  /**
   * Returns world bounds for one brush or all brushes in a model.
   *
   * @param modelId Optional solid model filter.
   * @param brushId Optional single brush id.
   * @returns Tool result with bounds list.
   */
  queryBrushBounds(modelId?: string, brushId?: string): McpToolResult {
    if (brushId) {
      const found = findBrush(this.host.worldObject, brushId);
      if (!found) return fail(`Brush not found: ${brushId}`);
      const bounds = boxToDto(computeBrushWorldBounds(found.model, found.brush));
      return ok('Brush bounds', { brushId, bounds });
    }
    const entries = this.collectBrushEntries(modelId).map(({ model, brush }) => ({
      modelId: model.root.uuid,
      brushId: brush.id,
      bounds: boxToDto(computeBrushWorldBounds(model, brush)),
    }));
    return ok(`Bounds for ${entries.length} brush(es)`, { entries });
  }

  /**
   * Finds brushes whose world AABBs overlap a query box or reference brush.
   * Includes operation so subtractive cutters are not mistaken for solid
   * fills.
   *
   * @param args Overlap query arguments.
   * @returns Tool result with overlapping brush ids and operation tags.
   */
  queryOverlaps(args: QueryOverlapsArgs): McpToolResult {
    const queryBox = this.resolveQueryBox(args);
    if (!queryBox) return fail('Provide bounds or brushId for overlap query');
    const brushes: AabbBrushHit[] = [];
    for (const { model, brush } of this.collectBrushEntries(args.modelId)) {
      if (args.brushId && brush.id === args.brushId) continue;
      const brushBox = computeBrushWorldBounds(model, brush);
      if (brushBox.isEmpty() || !brushBox.intersectsBox(queryBox)) continue;
      brushes.push(toAabbHit(model, brush));
    }
    return ok(`Found ${brushes.length} AABB overlap(s)`, {
      brushIds: brushes.map((hit) => hit.brushId),
      brushes,
      note: AABB_ONLY_NOTE,
    });
  }

  /**
   * Finds brushes whose world AABBs contain a point (not final CSG solid).
   *
   * @param args Point query arguments.
   * @returns Containing brush volumes with operation tags.
   */
  queryPoint(args: QueryPointArgs): McpToolResult {
    const point = dtoToVec3(args.point, new THREE.Vector3());
    const brushes: AabbBrushHit[] = [];
    for (const { model, brush } of this.collectBrushEntries(args.modelId)) {
      const brushBox = computeBrushWorldBounds(model, brush);
      if (brushBox.isEmpty() || !brushBox.containsPoint(point)) continue;
      brushes.push(toAabbHit(model, brush));
    }
    return ok(`Found ${brushes.length} brush volume(s) at point (AABB)`, {
      brushIds: brushes.map((hit) => hit.brushId),
      brushes,
      point: vec3ToDto(point),
      note: AABB_ONLY_NOTE,
    });
  }

  /**
   * Finds brushes whose centers lie within a radius of a point or brush.
   * Returns nearest-first ranks with shape tags so pole/flag pairs stand out.
   *
   * @param args Neighbor query arguments.
   * @returns Tool result with ranked neighbors.
   */
  queryNeighbors(args: QueryNeighborsArgs): McpToolResult {
    if (!(args.radius > 0)) return fail('radius must be positive');
    const center = this.resolveNeighborCenter(args);
    if (!center) return fail('Provide brushId or point for neighbor query');
    const radiusSquared = args.radius * args.radius;
    const hits = this.collectNeighborHits(args, center, radiusSquared);
    hits.sort((left, right) => left.distance - right.distance);
    const limited = typeof args.limit === 'number' && args.limit > 0 ? hits.slice(0, args.limit) : hits;
    const neighbors = limited.map((hit, index) => ({ ...hit, rank: index + 1 }));
    return ok(`Found ${neighbors.length} neighbor(s)`, { neighbors });
  }

  /**
   * Collects neighbor hit rows within radius.
   *
   * @param args Neighbor args.
   * @param center Query center.
   * @param radiusSquared Radius squared.
   * @returns Unsorted hits.
   */
  private collectNeighborHits(
    args: QueryNeighborsArgs,
    center: THREE.Vector3,
    radiusSquared: number,
  ): NeighborHitRow[] {
    const hits: NeighborHitRow[] = [];
    for (const { model, brush } of this.collectBrushEntries(args.modelId)) {
      if (args.brushId && brush.id === args.brushId) continue;
      const hit = this.neighborHitIfInRange(model, brush, center, radiusSquared);
      if (hit) hits.push(hit);
    }
    return hits;
  }

  /**
   * Builds one neighbor hit when the brush center is in range.
   *
   * @param model Owning model.
   * @param brush Brush instance.
   * @param center Query center.
   * @param radiusSquared Radius squared.
   * @returns Hit row or null.
   */
  private neighborHitIfInRange(
    model: SolidModel,
    brush: SolidBrushInstance,
    center: THREE.Vector3,
    radiusSquared: number,
  ): NeighborHitRow | null {
    const brushBox = computeBrushWorldBounds(model, brush);
    if (brushBox.isEmpty()) return null;
    const brushCenter = brushBox.getCenter(new THREE.Vector3());
    const distSq = distanceSquared(center, brushCenter);
    if (distSq > radiusSquared) return null;
    const size = vec3ToDto(brushBox.getSize(new THREE.Vector3()));
    const shapeInfo = classifyBrushShape(size, vec3ToDto(brushCenter));
    return {
      brushId: brush.id,
      name: brush.name,
      operation: solidOperationToName(brush.operation),
      distance: Math.sqrt(distSq),
      shape: shapeInfo.shape,
      kind: shapeInfo.kind,
      size,
    };
  }

  /**
   * Measures distance between points/brushes or reports brush size.
   *
   * @param args Measure arguments.
   * @returns Tool result with measurement data.
   */
  measure(args: MeasureArgs): McpToolResult {
    if (args.brushId) return this.measureBrushSize(args.brushId);
    const pointFrom = this.resolveMeasurePoint(args.brushIdFrom, args.pointFrom);
    const pointTo = this.resolveMeasurePoint(args.brushIdTo, args.pointTo);
    if (!pointFrom || !pointTo) return fail('Provide from/to brush ids or points');
    const distance = pointFrom.distanceTo(pointTo);
    return ok('Distance', {
      distance,
      from: vec3ToDto(pointFrom),
      to: vec3ToDto(pointTo),
    });
  }

  /**
   * Reports size and center for one brush.
   *
   * @param brushId Brush id.
   * @returns Tool result.
   */
  private measureBrushSize(brushId: string): McpToolResult {
    const found = findBrush(this.host.worldObject, brushId);
    if (!found) return fail(`Brush not found: ${brushId}`);
    const bounds = computeBrushWorldBounds(found.model, found.brush);
    if (bounds.isEmpty()) return fail('Brush has empty bounds');
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    return ok('Brush size', {
      brushId,
      size: vec3ToDto(size),
      center: vec3ToDto(center),
      bounds: boxToDto(bounds),
    });
  }

  /**
   * Resolves an overlap query box from args.
   *
   * @param args Overlap args.
   * @returns Query box or null.
   */
  private resolveQueryBox(args: QueryOverlapsArgs): THREE.Box3 | null {
    if (args.bounds) return dtoToBox(args.bounds);
    if (!args.brushId) return null;
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found) return null;
    return computeBrushWorldBounds(found.model, found.brush);
  }

  /**
   * Resolves neighbor query center.
   *
   * @param args Neighbor args.
   * @returns Center point or null.
   */
  private resolveNeighborCenter(args: QueryNeighborsArgs): THREE.Vector3 | null {
    if (args.point) return dtoToVec3(args.point, new THREE.Vector3());
    if (!args.brushId) return null;
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found) return null;
    const bounds = computeBrushWorldBounds(found.model, found.brush);
    if (bounds.isEmpty()) return null;
    return bounds.getCenter(new THREE.Vector3());
  }

  /**
   * Resolves a measure endpoint from brush id or point DTO.
   *
   * @param brushId Optional brush id.
   * @param point Optional point DTO.
   * @returns World point or null.
   */
  private resolveMeasurePoint(brushId: string | undefined, point: McpBounds['min'] | undefined): THREE.Vector3 | null {
    if (point) return dtoToVec3(point, new THREE.Vector3());
    if (!brushId) return null;
    const found = findBrush(this.host.worldObject, brushId);
    if (!found) return null;
    const boundsDto = boxToDto(computeBrushWorldBounds(found.model, found.brush));
    if (!boundsDto) return null;
    return boundsCenter(boundsDto);
  }

  /**
   * Collects brushes under the world, optionally filtered by model id.
   *
   * @param modelId Optional solid model root uuid.
   * @returns Brush entries.
   */
  private collectBrushEntries(modelId?: string): Array<{ model: SolidModel; brush: SolidBrushInstance }> {
    const models = modelId
      ? ([findSolidModel(this.host.worldObject, modelId)].filter(Boolean) as SolidModel[])
      : listSolidModels(this.host.worldObject);
    const entries: Array<{ model: SolidModel; brush: SolidBrushInstance }> = [];
    for (const model of models) {
      for (const brush of model.getBrushes()) {
        entries.push({ model, brush });
      }
    }
    return entries;
  }
}

/**
 * Builds a compact AABB hit row with CSG operation tag.
 *
 * @param model Owning model.
 * @param brush Brush instance.
 * @returns Hit row.
 */
function toAabbHit(model: SolidModel, brush: SolidBrushInstance): AabbBrushHit {
  return {
    brushId: brush.id,
    name: brush.name,
    operation: solidOperationToName(brush.operation),
    modelId: model.root.uuid,
  };
}

/**
 * Builds a successful tool result.
 *
 * @param message Human-readable message.
 * @param data Optional payload.
 * @returns Tool result.
 */
function ok(message: string, data?: unknown): McpToolResult {
  return { ok: true, message, data };
}

/**
 * Builds a failed tool result.
 *
 * @param message Error message.
 * @returns Tool result.
 */
function fail(message: string): McpToolResult {
  return { ok: false, message };
}
