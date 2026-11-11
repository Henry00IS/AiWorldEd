import * as THREE from 'three';
import { writeMeshDocumentDisplayGeometry } from '@/mesh/convert/mesh_document_display_write.js';
import { tryPatchMeshDocumentDisplayPositions } from '@/mesh/convert/mesh_display_position_patch.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { ComponentTransformVertex } from './component_transform_vertex.js';
import {
  componentTransformLocalToWorld,
  componentTransformWorldToLocal,
  writeComponentTransformVertexLocal,
} from './component_transform_vertex.js';
import { markSolidBrushConvexityState } from './brush_edit_convexity.js';

/**
 * Applies a world-space translation delta to component vertices from their
 * initial local snapshots.
 *
 * @param vertices Transform vertices.
 * @param worldDelta Snapped world translation.
 */
export function applyComponentTranslationDelta(
  vertices: readonly ComponentTransformVertex[],
  worldDelta: THREE.Vector3,
): void {
  for (const vertex of vertices) {
    const initialWorld = componentTransformLocalToWorld(vertex, vertex.initialLocal);
    const nextWorld = initialWorld.add(worldDelta);
    const nextLocal = componentTransformWorldToLocal(vertex, nextWorld);
    writeComponentTransformVertexLocal(vertex, nextLocal);
  }
  finalizeComponentGeometry(vertices);
}

/**
 * Applies a world-space rotation about a pivot to component vertices.
 *
 * @param vertices Transform vertices.
 * @param pivot World pivot.
 * @param axis World rotation axis.
 * @param angleRadians Rotation angle.
 */
export function applyComponentRotationDelta(
  vertices: readonly ComponentTransformVertex[],
  pivot: THREE.Vector3,
  axis: THREE.Vector3,
  angleRadians: number,
): void {
  const quaternion = new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), angleRadians);
  for (const vertex of vertices) {
    const initialWorld = componentTransformLocalToWorld(vertex, vertex.initialLocal);
    const offset = initialWorld.sub(pivot).applyQuaternion(quaternion);
    const nextWorld = pivot.clone().add(offset);
    const nextLocal = componentTransformWorldToLocal(vertex, nextWorld);
    writeComponentTransformVertexLocal(vertex, nextLocal);
  }
  finalizeComponentGeometry(vertices);
}

/**
 * Applies uniform/non-uniform scale about a pivot to component vertices.
 *
 * @param vertices Transform vertices.
 * @param pivot World pivot.
 * @param scaleFactors Axis scale factors.
 */
export function applyComponentScaleDelta(
  vertices: readonly ComponentTransformVertex[],
  pivot: THREE.Vector3,
  scaleFactors: THREE.Vector3,
): void {
  for (const vertex of vertices) {
    const initialWorld = componentTransformLocalToWorld(vertex, vertex.initialLocal);
    const offset = initialWorld.sub(pivot);
    offset.x *= scaleFactors.x;
    offset.y *= scaleFactors.y;
    offset.z *= scaleFactors.z;
    const nextWorld = pivot.clone().add(offset);
    const nextLocal = componentTransformWorldToLocal(vertex, nextWorld);
    writeComponentTransformVertexLocal(vertex, nextLocal);
  }
  finalizeComponentGeometry(vertices);
}

/**
 * Scales component vertices about a pivot in an oriented basis.
 *
 * @param vertices Transform vertices.
 * @param pivot World pivot.
 * @param scaleFactors Scale factors in the basis (X, Y, Z).
 * @param orientation Quaternion that maps the basis into world space.
 */
export function applyComponentScaleDeltaInBasis(
  vertices: readonly ComponentTransformVertex[],
  pivot: THREE.Vector3,
  scaleFactors: THREE.Vector3,
  orientation: THREE.Quaternion,
): void {
  const inverse = orientation.clone().invert();
  for (const vertex of vertices) {
    scaleComponentVertexInBasis(vertex, pivot, scaleFactors, orientation, inverse);
  }
  finalizeComponentGeometry(vertices);
}

/**
 * Scales one vertex offset in an oriented basis and writes the result.
 *
 * @param vertex Transform vertex.
 * @param pivot World pivot.
 * @param scaleFactors Scale factors in the basis.
 * @param orientation Basis-to-world quaternion.
 * @param inverse World-to-basis quaternion.
 */
function scaleComponentVertexInBasis(
  vertex: ComponentTransformVertex,
  pivot: THREE.Vector3,
  scaleFactors: THREE.Vector3,
  orientation: THREE.Quaternion,
  inverse: THREE.Quaternion,
): void {
  const initialWorld = componentTransformLocalToWorld(vertex, vertex.initialLocal);
  const offset = initialWorld.sub(pivot).applyQuaternion(inverse);
  scaleOffsetComponents(offset, scaleFactors);
  offset.applyQuaternion(orientation);
  const nextWorld = pivot.clone().add(offset);
  const nextLocal = componentTransformWorldToLocal(vertex, nextWorld);
  writeComponentTransformVertexLocal(vertex, nextLocal);
}

/**
 * Multiplies each component of an offset by the matching scale factor.
 *
 * @param offset Offset modified in place.
 * @param scaleFactors Per-axis scale factors.
 */
function scaleOffsetComponents(offset: THREE.Vector3, scaleFactors: THREE.Vector3): void {
  offset.x *= scaleFactors.x;
  offset.y *= scaleFactors.y;
  offset.z *= scaleFactors.z;
}

/**
 * Restores vertices to their pre-drag local positions and rebuilds displays.
 *
 * @param vertices Transform vertices.
 */
export function restoreComponentTransformVertices(vertices: readonly ComponentTransformVertex[]): void {
  for (const vertex of vertices) {
    writeComponentTransformVertexLocal(vertex, vertex.initialLocal);
  }
  finalizeComponentGeometry(vertices);
}

/**
 * Rebuilds mesh/brush display data of a committed component edit (drag end,
 * undo, redo). Meshes are redrawn in full from their documents, including
 * face-aligned texture mappings, so the saved and room state of the step is the
 * state the document draws: a room writes it back on undo and redo, and a state
 * that redraws differently would be committed again as a new step.
 *
 * @param vertices Transform vertices.
 */
export function rebuildComponentTransformDisplays(vertices: readonly ComponentTransformVertex[]): void {
  finalizeComponentGeometry(vertices, true);
}

/**
 * Redraws the meshes of a finished drag in full from their documents (brushes
 * are already final), for the same reason as
 * {@link rebuildComponentTransformDisplays}.
 *
 * @param vertices Transform vertices.
 */
export function redrawComponentTransformMeshes(vertices: readonly ComponentTransformVertex[]): void {
  const drawn = new Set<string>();
  for (const vertex of vertices) {
    if (vertex.kind !== 'mesh' || drawn.has(vertex.targetId)) continue;
    drawn.add(vertex.targetId);
    writeMeshDocumentDisplayGeometry(vertex.mesh, vertex.document);
  }
}

/**
 * Rebuilds mesh/brush display data after component position edits.
 *
 * @param vertices Transform vertices.
 * @param full True to redraw meshes in full instead of patching positions (a
 *   live drag frame patches only).
 */
function finalizeComponentGeometry(vertices: readonly ComponentTransformVertex[], full = false): void {
  const meshIds = new Set<string>();
  const brushKeys = new Set<string>();
  const solidModelsToFinalize = new Set<SolidModel>();
  for (const vertex of vertices) {
    if (vertex.kind === 'mesh') {
      if (meshIds.has(vertex.targetId)) {
        continue;
      }
      meshIds.add(vertex.targetId);
      if (full) writeMeshDocumentDisplayGeometry(vertex.mesh, vertex.document);
      else syncMeshDocumentDisplay(vertex.mesh, vertex.document);
      continue;
    }
    const key = `${vertex.solidModel.root.uuid}:${vertex.brushId}`;
    if (brushKeys.has(key)) {
      continue;
    }
    brushKeys.add(key);
    syncBrushGeometry(vertex);
    solidModelsToFinalize.add(vertex.solidModel);
  }
  finalizeSolidModelsAfterBrushEdits(solidModelsToFinalize);
}

/**
 * Recompiles solid result geometry for models whose brush hulls were edited.
 * Uses rebuild so shape-dirty brushes always recompile (not pose-only live
 * path).
 *
 * @param solidModels Models that received brush vertex updates.
 */
function finalizeSolidModelsAfterBrushEdits(solidModels: ReadonlySet<SolidModel>): void {
  for (const solidModel of solidModels) {
    solidModel.rebuild();
  }
}

/**
 * Rebuilds a content mesh BufferGeometry from its MeshDocument.
 *
 * @param mesh Display mesh.
 * @param document Source document.
 */
function syncMeshDocumentDisplay(
  mesh: THREE.Mesh,
  document: import('@/mesh/document/mesh_document.js').MeshDocument,
): void {
  if (tryPatchMeshDocumentDisplayPositions(mesh, document)) {
    return;
  }
  writeMeshDocumentDisplayGeometry(mesh, document);
}

/**
 * Rebuilds brush planes, preview mesh, and convexity flags after vertex edits.
 * Always dirties the brush so CSG drops non-convex hulls and rebuilds valid
 * ones.
 *
 * @param vertex Brush vertex descriptor.
 */
function syncBrushGeometry(vertex: Extract<ComponentTransformVertex, { kind: 'brush' }>): void {
  vertex.brush.recalculatePlanes();
  const validation = SolidBrushValidator.validate(vertex.brush);
  const instance = vertex.solidModel.findBrush(vertex.brushId);
  if (instance?.mesh) {
    SolidBrushVisual.replaceHullGeometry(instance.mesh, vertex.brush);
    markSolidBrushConvexityState(instance.mesh, validation.valid);
  }
  vertex.solidModel.markBrushesDirty([vertex.brushId]);
}
