import * as THREE from 'three';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import type { PhysicsShatterAxis } from './physics_shatter_types.js';

/** Plane through the middle of an input that 2D cracks are drawn on. */
export interface PhysicsShatterMidPlane {
  /** Unit normal: the direction the cracks run through. */
  normal: THREE.Vector3;
  /** A point halfway through the input along the normal. */
  point: THREE.Vector3;
  /** Width of the input along the normal. */
  thickness: number;
  /** First in-plane unit axis. */
  u: THREE.Vector3;
  /** Second in-plane unit axis. */
  v: THREE.Vector3;
}

/** Unit vectors of the frame axes. */
const PHYSICS_SHATTER_AXES: Readonly<Record<Exclude<PhysicsShatterAxis, 'auto'>, THREE.Vector3>> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

/**
 * Returns the lowest and highest vertex along a direction.
 *
 * @param brush Brush.
 * @param direction Unit direction.
 * @returns Lowest and highest projection.
 */
function physicsShatterExtent(brush: SolidBrush, direction: THREE.Vector3): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const vertex of brush.vertices) {
    const along = vertex.dot(direction);
    low = Math.min(low, along);
    high = Math.max(high, along);
  }
  return [low, high];
}

/**
 * Picks the direction 2D cracks run through: a frame axis, or for 'auto' the
 * face normal along which the input is thinnest, so a turned pane still breaks
 * across its face.
 *
 * @param brush Convex input brush.
 * @param axis Chosen axis.
 * @returns Unit normal.
 */
function physicsShatterThicknessNormal(brush: SolidBrush, axis: PhysicsShatterAxis): THREE.Vector3 {
  if (axis !== 'auto') return PHYSICS_SHATTER_AXES[axis].clone();
  let best = PHYSICS_SHATTER_AXES.z.clone();
  let thinnest = Infinity;
  for (const { normal } of brush.planes) {
    const [low, high] = physicsShatterExtent(brush, normal);
    if (high - low < thinnest - 1e-9) {
      thinnest = high - low;
      best = normal.clone().normalize();
    }
  }
  return best;
}

/**
 * Returns the plane halfway through an input along its thickness direction.
 *
 * @param brush Convex input brush.
 * @param axis Thickness axis, or 'auto'.
 * @returns Mid-plane with an in-plane basis.
 */
export function physicsShatterMidPlane(brush: SolidBrush, axis: PhysicsShatterAxis): PhysicsShatterMidPlane {
  const normal = physicsShatterThicknessNormal(brush, axis);
  const [low, high] = physicsShatterExtent(brush, normal);
  const centre = brush.vertices
    .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
    .multiplyScalar(1 / Math.max(1, brush.vertices.length));
  const point = centre.addScaledVector(normal, (low + high) / 2 - centre.dot(normal));
  const helper = Math.abs(normal.x) < 0.9 ? PHYSICS_SHATTER_AXES.x : PHYSICS_SHATTER_AXES.y;
  const u = new THREE.Vector3().crossVectors(normal, helper).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u);
  return { normal, point, thickness: high - low, u, v };
}

/**
 * Moves a point onto a mid-plane along its normal.
 *
 * @param plane Mid-plane.
 * @param point Point; left unchanged.
 * @returns Projected copy.
 */
export function physicsShatterOntoPlane(plane: PhysicsShatterMidPlane, point: THREE.Vector3): THREE.Vector3 {
  const offset = point.clone().sub(plane.point).dot(plane.normal);
  return point.clone().addScaledVector(plane.normal, -offset);
}
