import * as THREE from 'three';
import type { SolidBrush } from './solid_brush.js';
import { SolidBrushFactory } from './solid_brush_factory.js';

/** Shapes a plain brush can be added as, each filling a box of its size. */
export const SOLID_BRUSH_SHAPES = ['box', 'wedge'] as const;

/** Shape of a new plain brush. */
export type SolidBrushShape = (typeof SOLID_BRUSH_SHAPES)[number];

/** Title Case caption of each brush shape. */
export const SOLID_BRUSH_SHAPE_LABELS: Readonly<Record<SolidBrushShape, string>> = {
  box: 'Box Brush',
  wedge: 'Wedge Brush',
};

/**
 * Tells whether a value names a brush shape.
 *
 * @param value Candidate.
 * @returns True for a known shape id.
 */
export function isSolidBrushShape(value: unknown): value is SolidBrushShape {
  return (SOLID_BRUSH_SHAPES as readonly unknown[]).includes(value);
}

/**
 * Builds the convex topology of a brush shape centered on the origin.
 *
 * @param shape Brush shape.
 * @param size Full size along X, Y and Z.
 * @returns Centered brush.
 */
export function solidBrushShapeCreate(shape: SolidBrushShape, size: THREE.Vector3): SolidBrush {
  if (shape === 'wedge') return solidBrushShapeWedge(size);
  return SolidBrushFactory.createCenteredBox(size.x, size.y, size.z);
}

/**
 * Builds a ramp: the box cut diagonally from its top +Z edge to its bottom -Z
 * edge, so it is full height at +Z and comes to an edge on the floor at -Z.
 *
 * @param size Full size along X, Y and Z.
 * @returns Centered wedge.
 */
function solidBrushShapeWedge(size: THREE.Vector3): SolidBrush {
  const x = size.x * 0.5;
  const y = size.y * 0.5;
  const z = size.z * 0.5;
  const floorBack = [new THREE.Vector3(-x, -y, -z), new THREE.Vector3(x, -y, -z)] as const;
  const floorFront = [new THREE.Vector3(x, -y, z), new THREE.Vector3(-x, -y, z)] as const;
  const top = [new THREE.Vector3(-x, y, z), new THREE.Vector3(x, y, z)] as const;
  const brush = SolidBrushFactory.createFromFaceLoops([
    [floorBack[0], floorBack[1], floorFront[0], floorFront[1]],
    [floorFront[1], floorFront[0], top[1], top[0]],
    [floorBack[0], top[0], top[1], floorBack[1]],
    [floorBack[0], floorFront[1], top[0]],
    [floorBack[1], top[1], floorFront[0]],
  ]);
  return brush ?? SolidBrushFactory.createCenteredBox(size.x, size.y, size.z);
}
