import * as THREE from 'three';
import { SOLID_BRUSH_OPERATION_USERDATA_KEY, SOLID_BRUSH_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Saved visibility/material for restore after an overlap pass. */
interface OverlapObjectSnapshot {
  object: THREE.Object3D;
  visible: boolean;
  material: THREE.Material | THREE.Material[] | null;
}

/** Shared overdraw materials keyed by CSG operation, created on first use. */
const overlapMaterialsByOperation = new Map<SolidOperation, THREE.MeshBasicMaterial>();

/**
 * Prepares the scene for one brush-overlap render: CSG results hidden, brush
 * hulls shown with translucent overdraw so intersections light up. Returns a
 * restore callback that puts materials and visibility back.
 *
 * @param scene Shared editor scene.
 * @param revealHiddenBrushes When false, brushes the user hid stay hidden.
 * @returns Restore callback.
 */
export function prepareBrushOverlapMaterials(scene: THREE.Scene, revealHiddenBrushes = true): () => void {
  const snapshots: OverlapObjectSnapshot[] = [];
  scene.traverse((object) => prepareOneOverlapObject(object, snapshots, revealHiddenBrushes));
  return () => restoreBrushOverlapSnapshots(snapshots);
}

/**
 * Hides one CSG result mesh or swaps one brush hull to its overdraw material,
 * recording the prior state.
 *
 * @param object Scene object visited by the traversal.
 * @param snapshots Restore snapshots to append to.
 * @param revealHiddenBrushes When false, invisible brushes are left untouched.
 */
function prepareOneOverlapObject(
  object: THREE.Object3D,
  snapshots: OverlapObjectSnapshot[],
  revealHiddenBrushes: boolean,
): void {
  if (!(object instanceof THREE.Mesh)) {
    return;
  }
  if (isResultMesh(object)) {
    snapshots.push({ object, visible: object.visible, material: null });
    object.visible = false;
    return;
  }
  if (!isSolidBrushMesh(object) || (!revealHiddenBrushes && !object.visible)) {
    return;
  }
  snapshots.push({ object, visible: object.visible, material: object.material });
  object.visible = true;
  object.material = resolveOverlapMaterial(readBrushOperation(object));
}

/**
 * Returns the shared overdraw material for a CSG operation.
 *
 * @param operation Brush CSG operation.
 * @returns Cached overdraw material.
 */
export function resolveOverlapMaterial(operation: SolidOperation): THREE.MeshBasicMaterial {
  const cached = overlapMaterialsByOperation.get(operation);
  if (cached) {
    return cached;
  }
  const material = createOverlapMaterial(operation);
  overlapMaterialsByOperation.set(operation, material);
  return material;
}

/**
 * Builds a translucent overdraw material for one brush hull. Additive brushes:
 * cool cyan. Subtractive: warm red. Intersecting: violet. Overlaps stack
 * brighter where volumes intersect.
 *
 * @param operation Brush CSG operation.
 * @returns MeshBasicMaterial for overdraw.
 */
function createOverlapMaterial(operation: SolidOperation): THREE.MeshBasicMaterial {
  const color = colorForOperation(operation);
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Picks an overdraw color for a CSG operation.
 *
 * @param operation Solid operation.
 * @returns Hex color.
 */
function colorForOperation(operation: SolidOperation): number {
  if (operation === SolidOperation.Subtractive) {
    return 0xe86a17;
  }
  if (operation === SolidOperation.Intersecting) {
    return 0xb07cff;
  }
  return 0x3db8c9;
}

/**
 * Returns whether a mesh is a solid brush volume helper.
 *
 * @param mesh Candidate mesh.
 * @returns True for brush hulls.
 */
function isSolidBrushMesh(mesh: THREE.Mesh): boolean {
  return mesh.userData[SOLID_BRUSH_USERDATA_KEY] === true;
}

/**
 * Reads the CSG operation stored on a brush mesh.
 *
 * @param mesh Brush mesh.
 * @returns Operation enum value.
 */
function readBrushOperation(mesh: THREE.Mesh): SolidOperation {
  const value = mesh.userData[SOLID_BRUSH_OPERATION_USERDATA_KEY];
  if (value === SolidOperation.Subtractive || value === 'subtractive') {
    return SolidOperation.Subtractive;
  }
  if (value === SolidOperation.Intersecting || value === 'intersecting') {
    return SolidOperation.Intersecting;
  }
  return SolidOperation.Additive;
}

/**
 * Restores visibility and materials after an overlap render.
 *
 * @param snapshots Prior object states.
 */
function restoreBrushOverlapSnapshots(snapshots: readonly OverlapObjectSnapshot[]): void {
  for (const snapshot of snapshots) {
    snapshot.object.visible = snapshot.visible;
    if (snapshot.material !== null && snapshot.object instanceof THREE.Mesh) {
      snapshot.object.material = snapshot.material;
    }
  }
}
