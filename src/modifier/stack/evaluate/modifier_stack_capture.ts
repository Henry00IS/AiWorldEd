import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierVolumeBlacklistIgnores } from '@/modifier/volume/modifier_volume_blacklist.js';
import type { ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { modifierStackIsDerived } from './modifier_stack_copy.js';
import { isSolidBrushMarkedNonConvex } from '@/edit/transform/brush_edit_convexity.js';

/**
 * Captures the authored operands a volume touches. Derived brushes are never
 * captured, so no volume can feed on another volume's output.
 *
 * @param sources Authored brushes of one solid.
 * @param solidRoot Solid model root.
 * @param volume Modifier volume.
 * @param grouping 'brush' captures single brushes; anything else whole
 *   top-level compounds.
 * @param excluded Nodes whose brushes are never captured, such as array caps.
 * @returns Authored units in evaluation order.
 */
export function modifierStackCaptureUnits(
  sources: readonly SolidBrushInstance[],
  solidRoot: THREE.Object3D,
  volume: THREE.Object3D,
  grouping: string,
  excluded: readonly THREE.Object3D[] = [],
): ModifierStackUnit[] {
  const eligible = sources.filter(
    (source): source is SolidBrushInstance & { mesh: THREE.Mesh } =>
      modifierStackCaptureEligible(source, volume) && !excluded.some((node) => modifierStackUnder(source.mesh, node)),
  );
  const roots: THREE.Object3D[] = [];
  for (const source of eligible) {
    if (!modifierStackBrushTouches(source, volume)) continue;
    const root = modifierStackCaptureRoot(source.mesh, solidRoot, grouping);
    if (!roots.includes(root)) roots.push(root);
  }
  return roots.map((tree) => ({
    tree,
    brushes: eligible.filter((source) => modifierStackUnder(source.mesh, tree)),
    authored: true,
    origin: tree.uuid,
  }));
}

/**
 * Returns whether a volume may take a brush: it has a mesh, the volume does not
 * ignore it, and it is a valid brush. Brushes the CSG pipeline skips as invalid
 * (non-convex or broken after mesh editing) are skipped here too, so no
 * modifier processes them.
 *
 * @param source Authored brush.
 * @param volume Modifier volume.
 * @returns True when the brush can be captured.
 */
export function modifierStackCaptureEligible(
  source: SolidBrushInstance,
  volume: THREE.Object3D,
): source is SolidBrushInstance & { mesh: THREE.Mesh } {
  if (!source.mesh || isSolidBrushMarkedNonConvex(source.mesh)) return false;
  return !modifierVolumeBlacklistIgnores(volume, source.mesh);
}

/**
 * Returns how many brushes a volume touches but skips because they are invalid.
 *
 * @param sources Authored brushes.
 * @param volume Modifier volume.
 * @returns Skipped invalid brush count.
 */
export function modifierStackCaptureInvalidCount(
  sources: readonly SolidBrushInstance[],
  volume: THREE.Object3D,
): number {
  return sources.filter(
    (source) => source.mesh && isSolidBrushMarkedNonConvex(source.mesh) && modifierStackBrushTouches(source, volume),
  ).length;
}

/**
 * Tests a convex brush against the oriented volume box with a full separating
 * axis test.
 *
 * @param brush Authored brush.
 * @param volume Modifier volume.
 * @returns True when the brush overlaps the box.
 */
export function modifierStackBrushTouches(brush: SolidBrushInstance, volume: THREE.Object3D): boolean {
  if (!brush.mesh || !brush.visible || modifierStackIsDerived(brush.mesh)) return false;
  return modifierStackPoseTouches(brush, volume, brush.mesh.matrixWorld);
}

/**
 * Tests a convex brush placed by an explicit matrix against the oriented volume
 * box, such as a generated piece whose vertices are in solid space.
 *
 * @param brush Brush.
 * @param volume Modifier volume.
 * @param brushToWorld Brush-to-world matrix.
 * @returns True when the brush overlaps the box.
 */
export function modifierStackPoseTouches(
  brush: SolidBrushInstance,
  volume: THREE.Object3D,
  brushToWorld: THREE.Matrix4,
): boolean {
  const box = modifierStackLocalBox(volume);
  if (!box || Math.abs(volume.matrixWorld.determinant()) < 1e-10) return false;
  const pose = volume.matrixWorld.clone().invert().multiply(brushToWorld);
  const vertices = brush.brush.vertices.map((point) => point.clone().applyMatrix4(pose));
  if (!new THREE.Box3().setFromPoints(vertices).intersectsBox(box)) return false;
  return modifierStackCaptureAxes(brush, pose).every((axis) => !modifierStackAxisSeparates(axis, vertices, box));
}

/**
 * Returns the volume geometry box.
 *
 * @param volume Modifier volume.
 * @returns Local box, or null without geometry.
 */
function modifierStackLocalBox(volume: THREE.Object3D): THREE.Box3 | null {
  const geometry = (volume as THREE.Mesh).geometry;
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox;
}

/**
 * Builds face normals and crossed edge axes for the separating axis test.
 *
 * @param instance Brush.
 * @param pose Brush-to-volume matrix.
 * @returns Candidate axes.
 */
function modifierStackCaptureAxes(instance: SolidBrushInstance, pose: THREE.Matrix4): THREE.Vector3[] {
  const basis = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(pose);
  const axes = [...basis, ...instance.brush.planes.map((plane) => plane.normal.clone().applyMatrix3(normalMatrix))];
  for (const face of instance.brush.faces) {
    const points = instance.brush.getFaceVertices(face).map((point) => point.applyMatrix4(pose));
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      if (!next) return;
      const edge = next.clone().sub(point);
      for (const axis of basis) axes.push(edge.clone().cross(axis));
    });
  }
  return axes;
}

/**
 * Tests whether projected intervals are separated.
 *
 * @param axis Candidate axis.
 * @param points Brush vertices in volume space.
 * @param box Volume box.
 * @returns True when the axis separates brush and box.
 */
function modifierStackAxisSeparates(axis: THREE.Vector3, points: readonly THREE.Vector3[], box: THREE.Box3): boolean {
  if (axis.lengthSq() < 1e-16) return false;
  axis.normalize();
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const middle = center.dot(axis);
  const radius = Math.abs(axis.x) * half.x + Math.abs(axis.y) * half.y + Math.abs(axis.z) * half.z;
  const projected = points.map((point) => point.dot(axis));
  return Math.max(...projected) < middle - radius - 1e-7 || Math.min(...projected) > middle + radius + 1e-7;
}

/**
 * Finds the node captured for a brush.
 *
 * @param mesh Brush mesh.
 * @param solidRoot Solid root.
 * @param grouping Capture policy.
 * @returns The brush itself or its top-level ancestor below the root.
 */
function modifierStackCaptureRoot(mesh: THREE.Object3D, solidRoot: THREE.Object3D, grouping: string): THREE.Object3D {
  if (grouping === 'brush') return mesh;
  let unit = mesh;
  while (unit.parent && unit.parent !== solidRoot) unit = unit.parent;
  return unit;
}

/**
 * Tests ancestry.
 *
 * @param node Candidate.
 * @param ancestor Captured node.
 * @returns True when the node is the ancestor or below it.
 */
export function modifierStackUnder(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}
