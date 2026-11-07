import * as THREE from 'three';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/**
 * Tests convex brush against an oriented selector with full SAT. @param brush
 * Authored brush. @param volume Selector mesh.
 */
export function generatorBrushTouches(brush: SolidBrushInstance, volume: THREE.Object3D): boolean {
  if (!brush.mesh || !brush.visible || brush.mesh.userData['generatorDerived']) return false;
  const geometry = (volume as THREE.Mesh).geometry;
  if (!geometry || Math.abs(volume.matrixWorld.determinant()) < 1e-10) return false;
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return false;
  const pose = new THREE.Matrix4().copy(volume.matrixWorld).invert().multiply(brush.mesh.matrixWorld);
  const vertices = brush.brush.vertices.map((point) => point.clone().applyMatrix4(pose));
  const box = geometry.boundingBox;
  if (!new THREE.Box3().setFromPoints(vertices).intersectsBox(box)) return false;
  const axes = generatorCaptureAxes(brush, pose);
  return axes.every((axis) => !generatorAxisSeparates(axis, vertices, box));
}
/**
 * Builds SAT face and crossed edge axes. @param instance Brush. @param pose
 * Brush-to-selector matrix.
 */
function generatorCaptureAxes(instance: SolidBrushInstance, pose: THREE.Matrix4): THREE.Vector3[] {
  const basis = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(pose);
  const axes = [...basis, ...instance.brush.planes.map((plane) => plane.normal.clone().applyMatrix3(normalMatrix))];
  for (const face of instance.brush.faces) {
    const points = instance.brush.getFaceVertices(face);
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      if (!next) return;
      const edge = next.clone().applyMatrix4(pose).sub(point.clone().applyMatrix4(pose));
      for (const axis of basis) axes.push(edge.clone().cross(axis));
    });
  }
  return axes;
}
/**
 * Tests projected convex intervals. @param axis SAT direction. @param points
 * Convex vertices. @param box Selector bounds.
 */
function generatorAxisSeparates(axis: THREE.Vector3, points: THREE.Vector3[], box: THREE.Box3): boolean {
  if (axis.lengthSq() < 1e-16) return false;
  axis.normalize();
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const middle = center.dot(axis);
  const radius = Math.abs(axis.x) * half.x + Math.abs(axis.y) * half.y + Math.abs(axis.z) * half.z;
  const projected = points.map((point) => point.dot(axis));
  return Math.max(...projected) < middle - radius - 1e-7 || Math.min(...projected) > middle + radius + 1e-7;
}
