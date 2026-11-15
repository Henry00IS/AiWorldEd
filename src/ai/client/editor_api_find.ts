import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type { FindBrushesArgs } from './editor_api_types.js';
import { boxToDto, computeBrushWorldBounds, vec3ToDto } from './editor_api_math.js';
import { findBrush, findSolidModel, listSolidModels } from './editor_api_lookup.js';
import { classifyBrushShape, shapeMatchesFilter, type BrushShapeTag } from './editor_api_shape.js';
import { solidOperationToName } from './editor_api_operations.js';
import { failResult, okResult } from './editor_api_result.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/** One row returned by brush_find / brush_describe. */
export interface FindBrushRow {
  brushId: string;
  modelId: string;
  name: string;
  operation: string;
  shape: BrushShapeTag;
  kind: string;
  summary: string;
  size: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  bounds: ReturnType<typeof boxToDto>;
  height: number;
}

/** Filtered inventory and human brush descriptions for AI scanning. */
export class EditorApiFind {
  private readonly host: EditorApiHost;

  /**
   * Creates find helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Lists brushes matching name, shape, height, or region filters.
   *
   * @param args Filter arguments.
   * @returns Matching brush rows with shape tags.
   */
  findBrushes(args: FindBrushesArgs): McpToolResult {
    const rows = [];
    for (const { model, brush } of this.collectEntries(args.modelId)) {
      const row = this.toFindRow(model, brush);
      if (!row) continue;
      if (!this.matchesFilters(row, args)) continue;
      rows.push(row);
    }
    const limited = typeof args.limit === 'number' && args.limit > 0 ? rows.slice(0, args.limit) : rows;
    return okResult(`Found ${limited.length} brush(es)`, { brushes: limited, total: rows.length });
  }

  /**
   * Returns a one-line human summary for one brush.
   *
   * @param brushId Brush id.
   * @returns Description payload.
   */
  describeBrush(brushId: string): McpToolResult {
    const found = findBrush(this.host.worldObject, brushId);
    if (!found) return failResult(`Brush not found: ${brushId}`);
    const row = this.toFindRow(found.model, found.brush);
    if (!row) return failResult('Brush has empty bounds');
    return okResult(row.summary, row);
  }

  /**
   * Builds a find/describe row for one brush.
   *
   * @param model Owning model.
   * @param brush Brush instance.
   * @returns Row or null when bounds empty.
   */
  private toFindRow(model: SolidModel, brush: SolidBrushInstance): FindBrushRow | null {
    const boundsBox = computeBrushWorldBounds(model, brush);
    if (boundsBox.isEmpty()) return null;
    const size = boundsBox.getSize(new THREE.Vector3());
    const center = boundsBox.getCenter(new THREE.Vector3());
    const sizeDto = vec3ToDto(size);
    const centerDto = vec3ToDto(center);
    const shapeInfo = classifyBrushShape(sizeDto, centerDto);
    return {
      brushId: brush.id,
      modelId: model.root.uuid,
      name: brush.name,
      operation: solidOperationToName(brush.operation),
      shape: shapeInfo.shape,
      kind: shapeInfo.kind,
      summary: `${brush.name}: ${shapeInfo.summary}`,
      size: sizeDto,
      center: centerDto,
      bounds: boxToDto(boundsBox),
      height: Math.abs(size.y),
    };
  }

  /**
   * Returns true when a row matches all provided filters.
   *
   * @param row Find row.
   * @param args Filters.
   * @returns Match flag.
   */
  private matchesFilters(row: FindBrushRow, args: FindBrushesArgs): boolean {
    if (args.nameContains && !row.name.toLowerCase().includes(args.nameContains.toLowerCase())) return false;
    if (args.shape && !shapeMatchesFilter(row.shape, args.shape)) return false;
    if (typeof args.heightMin === 'number' && row.height < args.heightMin) return false;
    if (typeof args.heightMax === 'number' && row.height > args.heightMax) return false;
    if (args.region && !centerInRegion(row.center, args.region)) return false;
    return true;
  }

  /**
   * Collects brushes under optional model filter.
   *
   * @param modelId Optional model uuid.
   * @returns Brush entries.
   */
  private collectEntries(modelId?: string): Array<{ model: SolidModel; brush: SolidBrushInstance }> {
    const models = modelId
      ? ([findSolidModel(this.host.worldObject, modelId)].filter(Boolean) as SolidModel[])
      : listSolidModels(this.host.worldObject);
    const entries: Array<{ model: SolidModel; brush: SolidBrushInstance }> = [];
    for (const model of models) {
      for (const brush of model.getBrushes()) entries.push({ model, brush });
    }
    return entries;
  }
}

/**
 * Returns true when a center point lies inside region bounds.
 *
 * @param center Point to test.
 * @param region Inclusive AABB.
 * @returns True when inside.
 */
function centerInRegion(
  center: { x: number; y: number; z: number },
  region: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
): boolean {
  return (
    center.x >= region.min.x &&
    center.x <= region.max.x &&
    center.y >= region.min.y &&
    center.y <= region.max.y &&
    center.z >= region.min.z &&
    center.z <= region.max.z
  );
}
