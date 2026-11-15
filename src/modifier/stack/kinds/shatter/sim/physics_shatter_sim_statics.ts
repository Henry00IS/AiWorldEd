import * as THREE from 'three';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { PhysicsShatterPiece } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';

/**
 * Distance around the pieces within which world brushes become fixed geometry,
 * in metres.
 */
const PHYSICS_SHATTER_STATICS_MARGIN = 25;

/** Fixed geometry the pieces land on. */
export interface PhysicsShatterStatics {
  /** Flat world-space hull points of each nearby additive brush. */
  hulls: Float32Array[];
  /**
   * World height of the endless floor: the lowest point of the pieces and
   * nearby brushes.
   */
  floorHeight: number;
}

/**
 * Collects the visible additive brushes of every solid near the pieces as fixed
 * hulls, leaving out the modifier's inputs: the brushes the pieces were cut
 * from and those that made none, such as brushes fully covered by later ones.
 * Places a floor under the lowest of them all.
 *
 * @param sceneRoot Scene root.
 * @param pieces Pieces in the modifier frame.
 * @param frameToWorld Modifier frame to world matrix.
 * @param inputBrushIds Every brush the modifier gathered as an input.
 * @returns Fixed hulls and floor height.
 */
export function physicsShatterStaticsGather(
  sceneRoot: THREE.Object3D,
  pieces: readonly PhysicsShatterPiece[],
  frameToWorld: THREE.Matrix4,
  inputBrushIds: readonly string[] = [],
): PhysicsShatterStatics {
  const pieceBounds = physicsShatterStaticsPieceBounds(pieces, frameToWorld);
  const region = pieceBounds.clone().expandByScalar(PHYSICS_SHATTER_STATICS_MARGIN);
  const excluded = new Set([...inputBrushIds, ...pieces.map((piece) => piece.sourceBrushId)]);
  const hulls: Float32Array[] = [];
  let floorHeight = pieceBounds.isEmpty() ? 0 : pieceBounds.min.y;
  for (const model of SolidModelRegistry.collectUnder(sceneRoot)) {
    for (const brush of physicsShatterStaticsBrushes(model, excluded)) {
      const points = physicsShatterStaticsWorldPoints(model, brush);
      const bounds = new THREE.Box3().setFromArray(points);
      if (!bounds.intersectsBox(region)) continue;
      hulls.push(points);
      floorHeight = Math.min(floorHeight, bounds.min.y);
    }
  }
  return { hulls, floorHeight };
}

/**
 * Returns the world bounds of all pieces.
 *
 * @param pieces Pieces in the modifier frame.
 * @param frameToWorld Modifier frame to world matrix.
 * @returns World bounds, empty without pieces.
 */
function physicsShatterStaticsPieceBounds(
  pieces: readonly PhysicsShatterPiece[],
  frameToWorld: THREE.Matrix4,
): THREE.Box3 {
  const bounds = new THREE.Box3();
  const scratch = new THREE.Vector3();
  for (const piece of pieces) {
    for (let offset = 0; offset + 2 < piece.hull.length; offset += 3) {
      bounds.expandByPoint(scratch.fromArray(piece.hull, offset).applyMatrix4(frameToWorld));
    }
  }
  return bounds;
}

/**
 * Lists the visible additive brushes of a solid that the pieces were not cut
 * from.
 *
 * @param model Solid model.
 * @param excluded Brush ids to leave out.
 * @returns Brushes.
 */
function physicsShatterStaticsBrushes(model: SolidModel, excluded: ReadonlySet<string>): SolidBrushInstance[] {
  if (model.isInvertedWorld()) return [];
  return model
    .getBrushes()
    .filter((brush) => brush.visible && brush.operation === SolidOperation.Additive && !excluded.has(brush.id));
}

/**
 * Returns a brush's vertices in world space.
 *
 * @param model Solid model owning the brush.
 * @param brush Brush.
 * @returns Flat world-space points.
 */
function physicsShatterStaticsWorldPoints(model: SolidModel, brush: SolidBrushInstance): Float32Array {
  const vertices = brush.getModelSpaceBrush().vertices;
  const points = new Float32Array(vertices.length * 3);
  const scratch = new THREE.Vector3();
  vertices.forEach((vertex, index) =>
    scratch
      .copy(vertex)
      .applyMatrix4(model.root.matrixWorld)
      .toArray(points, index * 3),
  );
  return points;
}
