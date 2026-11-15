import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type { ExplainCsgAtPointArgs, QueryVoidConnectivityArgs } from './editor_api_types.js';
import { dtoToVec3, vec3ToDto } from './editor_api_math.js';
import { findSolidModel, listSolidModels } from './editor_api_lookup.js';
import { solidOperationToName } from './editor_api_operations.js';
import { failResult, okResult } from './editor_api_result.js';
import { BrushMembership } from '@/solid/algorithm/spatial/brush_membership.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidCsgTreeEvaluator } from '@/solid/algorithm/compile/solid_csg_tree_evaluator.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

const MAX_VOID_GRID = 18;
const VOID_LINE_SAMPLES = 48;

/** CSG point membership and simple void connectivity queries. */
export class EditorApiCsgQuery {
  private readonly host: EditorApiHost;

  /**
   * Creates CSG query helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Explains ordered brush contributions at a world point and final solid/void.
   *
   * @param args Point query arguments.
   * @returns Membership fold and affecting brushes.
   */
  explainCsgAtPoint(args: ExplainCsgAtPointArgs): McpToolResult {
    const model = this.resolveModel(args.modelId);
    if (!model) return failResult(args.modelId ? `Solid model not found: ${args.modelId}` : 'No solid model in scene');
    const worldPoint = dtoToVec3(args.point, new THREE.Vector3());
    const modelPoint = worldToModelPoint(model, worldPoint);
    const fold = foldCsgAtModelPoint(model, modelPoint);
    return okResult(fold.finalSolid ? 'Point is solid' : 'Point is void', {
      modelId: model.root.uuid,
      point: vec3ToDto(worldPoint),
      modelPoint: vec3ToDto(modelPoint),
      invertedWorld: model.isInvertedWorld(),
      hierarchical: fold.hierarchical,
      final: fold.finalSolid ? 'solid' : 'void',
      finalSolid: fold.finalSolid,
      affectingBrushes: fold.affecting,
      steps: fold.steps,
    });
  }

  /**
   * Checks whether two void points connect through empty space (approximate).
   * Uses a straight-line sample first, then a coarse grid flood-fill.
   *
   * @param args Connectivity arguments.
   * @returns Connected flag and a sample path when found.
   */
  queryVoidConnectivity(args: QueryVoidConnectivityArgs): McpToolResult {
    const model = this.resolveModel(args.modelId);
    if (!model) return failResult(args.modelId ? `Solid model not found: ${args.modelId}` : 'No solid model in scene');
    const fromWorld = dtoToVec3(args.pointFrom, new THREE.Vector3());
    const toWorld = dtoToVec3(args.pointTo, new THREE.Vector3());
    const from = worldToModelPoint(model, fromWorld);
    const to = worldToModelPoint(model, toWorld);
    if (isSolidAtModelPoint(model, from)) {
      return okResult('Start point is solid (not void)', {
        connected: false,
        reason: 'from_point_solid',
        path: [],
      });
    }
    if (isSolidAtModelPoint(model, to)) {
      return okResult('End point is solid (not void)', {
        connected: false,
        reason: 'to_point_solid',
        path: [],
      });
    }
    const linePath = sampleVoidLinePath(model, from, to);
    if (linePath) {
      return okResult('Voids connect along a straight line', {
        connected: true,
        method: 'line',
        path: linePath.map((point) => vec3ToDto(modelToWorldPoint(model, point))),
      });
    }
    const gridPath = floodFillVoidPath(model, from, to);
    if (gridPath) {
      return okResult('Voids connect via coarse grid path', {
        connected: true,
        method: 'grid',
        path: gridPath.map((point) => vec3ToDto(modelToWorldPoint(model, point))),
        note: 'Approximate connectivity on a capped grid; not a navmesh.',
      });
    }
    return okResult('No void path found on sample grid', {
      connected: false,
      method: 'grid',
      path: [],
      note: 'Approximate only; fine gaps may be missed.',
    });
  }

  /**
   * Resolves an optional model id or the first solid model in the world.
   *
   * @param modelId Optional model uuid.
   * @returns Model or null.
   */
  private resolveModel(modelId?: string): SolidModel | null {
    if (modelId) return findSolidModel(this.host.worldObject, modelId);
    return listSolidModels(this.host.worldObject)[0] ?? null;
  }
}

/** One CSG fold step at a sample point. */
interface CsgFoldStep {
  brushId: string;
  name: string;
  operation: string;
  orderIndex: number;
  containsPoint: boolean;
  solidAfter: boolean;
}

/** Result of hierarchical or flat CSG fold at a model-space point. */
interface CsgFoldResult {
  finalSolid: boolean;
  hierarchical: boolean;
  steps: CsgFoldStep[];
  affecting: CsgFoldStep[];
}

/**
 * Folds CSG membership at a model-space point using the solid scene tree so
 * compound group operations match the real CSG compiler.
 *
 * @param model Solid model.
 * @param modelPoint Point in model space.
 * @returns Fold result.
 */
function foldCsgAtModelPoint(model: SolidModel, modelPoint: THREE.Vector3): CsgFoldResult {
  const prepared = prepareBrushesForMembershipQuery(model);
  const tree = SolidCsgTree.fromSceneGraph(model.root, prepared);
  const finalSolid = evaluateTreeMembership(modelPoint, prepared, tree, model.isInvertedWorld());
  const steps = buildBrushContainmentSteps(prepared, modelPoint, finalSolid, tree.isFlat, model.isInvertedWorld());
  return {
    finalSolid,
    hierarchical: !tree.isFlat,
    steps,
    affecting: steps.filter((step) => step.containsPoint),
  };
}

/**
 * Builds prepared brush snapshots in evaluation order for membership queries.
 *
 * @param model Solid model.
 * @returns Prepared brush list.
 */
function prepareBrushesForMembershipQuery(model: SolidModel): PreparedBrush[] {
  model.syncBrushOrderFromScene();
  return model.getBrushes().map((instance) => prepareOneBrushForQuery(instance));
}

/**
 * Prepares one brush instance for point membership tests.
 *
 * @param instance Brush instance.
 * @returns Prepared brush entry.
 */
function prepareOneBrushForQuery(instance: SolidBrushInstance): PreparedBrush {
  instance.pullTransformFromMesh();
  const brush = instance.getModelSpaceBrush();
  return {
    instance,
    brush,
    bounds: brush.computeLocalBounds(),
    overlappingPeerIndices: [],
    operation: instance.operation,
  };
}

/**
 * Evaluates hierarchical CSG membership at a model-space point.
 *
 * @param modelPoint Sample point.
 * @param prepared Prepared brushes.
 * @param tree CSG tree from the solid scene graph.
 * @param invertedWorld Whether evaluation starts solid.
 * @returns True when the point is solid.
 */
function evaluateTreeMembership(
  modelPoint: THREE.Vector3,
  prepared: readonly PreparedBrush[],
  tree: SolidCsgTree,
  invertedWorld: boolean,
): boolean {
  return SolidCsgTreeEvaluator.evaluateMembership(modelPoint, prepared, tree, invertedWorld, (sample, entry) =>
    pointInsidePreparedBrush(sample, entry),
  );
}

/**
 * Builds per-brush containment steps for space_solid_point_explain. Flat models
 * report a running solidAfter fold; hierarchical models stamp the true final
 * membership on every step so solidAfter is never a misleading flat fold.
 *
 * @param prepared Prepared brushes.
 * @param modelPoint Sample point.
 * @param finalSolid Hierarchical final membership.
 * @param isFlat Whether the CSG tree has no compound branches.
 * @param invertedWorld Starting solid flag for flat folds.
 * @returns Step list.
 */
function buildBrushContainmentSteps(
  prepared: readonly PreparedBrush[],
  modelPoint: THREE.Vector3,
  finalSolid: boolean,
  isFlat: boolean,
  invertedWorld: boolean,
): CsgFoldStep[] {
  const steps: CsgFoldStep[] = [];
  let solid = invertedWorld;
  for (let orderIndex = 0; orderIndex < prepared.length; orderIndex++) {
    const entry = prepared[orderIndex]!;
    const containsPoint = pointInsidePreparedBrush(modelPoint, entry);
    solid = isFlat ? applySolidOperation(solid, containsPoint, entry.operation) : finalSolid;
    steps.push(createFoldStep(entry, orderIndex, containsPoint, solid));
  }
  return steps;
}

/**
 * Creates one fold step DTO for a prepared brush.
 *
 * @param entry Prepared brush.
 * @param orderIndex Evaluation index.
 * @param containsPoint Whether the sample is inside the brush.
 * @param solidAfter Solid flag after this step (or final for hierarchical
 *   last).
 * @returns Fold step.
 */
function createFoldStep(
  entry: PreparedBrush,
  orderIndex: number,
  containsPoint: boolean,
  solidAfter: boolean,
): CsgFoldStep {
  return {
    brushId: entry.instance.id,
    name: entry.instance.name,
    operation: solidOperationToName(entry.operation),
    orderIndex,
    containsPoint,
    solidAfter,
  };
}

/**
 * Returns final solid membership at a model-space point.
 *
 * @param model Solid model.
 * @param modelPoint Point in model space.
 * @returns True when solid.
 */
function isSolidAtModelPoint(model: SolidModel, modelPoint: THREE.Vector3): boolean {
  return foldCsgAtModelPoint(model, modelPoint).finalSolid;
}

/**
 * Tests whether a model-space point is inside a prepared brush volume.
 *
 * @param modelPoint Model-space point.
 * @param entry Prepared brush.
 * @returns True when inside or on boundary.
 */
function pointInsidePreparedBrush(modelPoint: THREE.Vector3, entry: PreparedBrush): boolean {
  return BrushMembership.isInsidePlanes(modelPoint, entry.brush.planes);
}

/**
 * Applies one CSG operation to a running solid flag.
 *
 * @param solid Previous solid flag.
 * @param inBrush Whether the point is in the brush.
 * @param operation Brush operation.
 * @returns Updated solid flag.
 */
function applySolidOperation(solid: boolean, inBrush: boolean, operation: SolidOperation): boolean {
  if (operation === SolidOperation.Additive) return solid || inBrush;
  if (operation === SolidOperation.Subtractive) return solid && !inBrush;
  return solid && inBrush;
}

/**
 * Samples a straight line; returns path when every sample is void.
 *
 * @param model Solid model.
 * @param from Start model point.
 * @param to End model point.
 * @returns Path or null when blocked.
 */
function sampleVoidLinePath(model: SolidModel, from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
  const path: THREE.Vector3[] = [];
  for (let index = 0; index <= VOID_LINE_SAMPLES; index++) {
    const t = index / VOID_LINE_SAMPLES;
    const point = from.clone().lerp(to, t);
    if (isSolidAtModelPoint(model, point)) return null;
    path.push(point);
  }
  return path;
}

/**
 * Coarse grid BFS through void cells between two points.
 *
 * @param model Solid model.
 * @param from Start model point.
 * @param to End model point.
 * @returns Path of cell centers, or null.
 */
function floodFillVoidPath(model: SolidModel, from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
  const bounds = new THREE.Box3().setFromPoints([from, to]);
  const padding = Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.25, 1);
  bounds.expandByScalar(padding);
  const size = bounds.getSize(new THREE.Vector3());
  const steps = pickGridSteps(size);
  const start = worldToGrid(from, bounds, steps);
  const goal = worldToGrid(to, bounds, steps);
  if (!start || !goal) return null;
  if (cellSolid(model, start, bounds, steps) || cellSolid(model, goal, bounds, steps)) return null;
  return bfsVoid(model, start, goal, bounds, steps);
}

/**
 * Picks grid resolution per axis capped for performance.
 *
 * @param size Bounds size.
 * @returns Integer steps for x/y/z.
 */
function pickGridSteps(size: THREE.Vector3): { x: number; y: number; z: number } {
  const clamp = (value: number) => Math.max(4, Math.min(MAX_VOID_GRID, Math.ceil(value)));
  return {
    x: clamp(size.x),
    y: clamp(size.y),
    z: clamp(size.z),
  };
}

/**
 * BFS over void grid cells.
 *
 * @param model Solid model.
 * @param start Start cell.
 * @param goal Goal cell.
 * @param bounds Search bounds.
 * @param steps Grid steps.
 * @returns Path of world-model cell centers or null.
 */
function bfsVoid(
  model: SolidModel,
  start: GridCell,
  goal: GridCell,
  bounds: THREE.Box3,
  steps: { x: number; y: number; z: number },
): THREE.Vector3[] | null {
  const keyOf = (cell: GridCell) => `${cell.x},${cell.y},${cell.z}`;
  const queue: GridCell[] = [start];
  const cameFrom = new Map<string, string | null>();
  cameFrom.set(keyOf(start), null);
  const neighbors = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.x === goal.x && current.y === goal.y && current.z === goal.z) {
      return reconstructPath(cameFrom, current, bounds, steps);
    }
    for (const [dx, dy, dz] of neighbors) {
      const next = { x: current.x + dx, y: current.y + dy, z: current.z + dz };
      if (!inGrid(next, steps) || cameFrom.has(keyOf(next))) continue;
      if (cellSolid(model, next, bounds, steps)) continue;
      cameFrom.set(keyOf(next), keyOf(current));
      queue.push(next);
    }
  }
  return null;
}

/** Integer grid cell. */
interface GridCell {
  x: number;
  y: number;
  z: number;
}

/**
 * Maps a model point into a grid cell.
 *
 * @param point Model point.
 * @param bounds Grid bounds.
 * @param steps Grid steps.
 * @returns Cell or null when outside.
 */
function worldToGrid(
  point: THREE.Vector3,
  bounds: THREE.Box3,
  steps: { x: number; y: number; z: number },
): GridCell | null {
  const size = bounds.getSize(new THREE.Vector3());
  const cell = {
    x: Math.floor(((point.x - bounds.min.x) / Math.max(size.x, 1e-6)) * steps.x),
    y: Math.floor(((point.y - bounds.min.y) / Math.max(size.y, 1e-6)) * steps.y),
    z: Math.floor(((point.z - bounds.min.z) / Math.max(size.z, 1e-6)) * steps.z),
  };
  if (!inGrid(cell, steps)) return null;
  return cell;
}

/**
 * Returns whether a grid cell is inside the index range.
 *
 * @param cell Cell indices.
 * @param steps Grid steps.
 * @returns True when in range.
 */
function inGrid(cell: GridCell, steps: { x: number; y: number; z: number }): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.z >= 0 && cell.x < steps.x && cell.y < steps.y && cell.z < steps.z;
}

/**
 * Returns whether the cell center is solid.
 *
 * @param model Solid model.
 * @param cell Grid cell.
 * @param bounds Search bounds.
 * @param steps Grid steps.
 * @returns True when solid.
 */
function cellSolid(
  model: SolidModel,
  cell: GridCell,
  bounds: THREE.Box3,
  steps: { x: number; y: number; z: number },
): boolean {
  return isSolidAtModelPoint(model, cellCenter(cell, bounds, steps));
}

/**
 * Converts a grid cell to its model-space center.
 *
 * @param cell Grid cell.
 * @param bounds Search bounds.
 * @param steps Grid steps.
 * @returns Model-space center.
 */
function cellCenter(cell: GridCell, bounds: THREE.Box3, steps: { x: number; y: number; z: number }): THREE.Vector3 {
  const size = bounds.getSize(new THREE.Vector3());
  return new THREE.Vector3(
    bounds.min.x + ((cell.x + 0.5) / steps.x) * size.x,
    bounds.min.y + ((cell.y + 0.5) / steps.y) * size.y,
    bounds.min.z + ((cell.z + 0.5) / steps.z) * size.z,
  );
}

/**
 * Rebuilds a path of cell centers from BFS parents.
 *
 * @param cameFrom Parent map.
 * @param goal Goal cell.
 * @param bounds Search bounds.
 * @param steps Grid steps.
 * @returns Path points.
 */
function reconstructPath(
  cameFrom: Map<string, string | null>,
  goal: GridCell,
  bounds: THREE.Box3,
  steps: { x: number; y: number; z: number },
): THREE.Vector3[] {
  const path: THREE.Vector3[] = [];
  let key: string | null = `${goal.x},${goal.y},${goal.z}`;
  while (key) {
    const [x, y, z] = key.split(',').map(Number) as [number, number, number];
    path.push(cellCenter({ x, y, z }, bounds, steps));
    key = cameFrom.get(key) ?? null;
  }
  return path.reverse();
}

/**
 * Converts a world point into model-local space.
 *
 * @param model Solid model.
 * @param worldPoint World point.
 * @returns Model-space point.
 */
function worldToModelPoint(model: SolidModel, worldPoint: THREE.Vector3): THREE.Vector3 {
  model.root.updateMatrixWorld(true);
  return worldPoint.clone().applyMatrix4(new THREE.Matrix4().copy(model.root.matrixWorld).invert());
}

/**
 * Converts a model-local point into world space.
 *
 * @param model Solid model.
 * @param modelPoint Model-space point.
 * @returns World point.
 */
function modelToWorldPoint(model: SolidModel, modelPoint: THREE.Vector3): THREE.Vector3 {
  model.root.updateMatrixWorld(true);
  return modelPoint.clone().applyMatrix4(model.root.matrixWorld);
}
