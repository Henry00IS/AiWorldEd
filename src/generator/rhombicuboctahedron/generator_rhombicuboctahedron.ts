import * as THREE from 'three';

/**
 * How a rhombicuboctahedron is shaped: on the grid with exact 45° faces, or the
 * true solid.
 */
export type GeneratorRhombicuboctahedronPrecision = 'Grid Aligned' | 'Precise';

/** Precision choices, default first. */
export const GENERATOR_RHOMBICUBOCTAHEDRON_PRECISIONS: readonly GeneratorRhombicuboctahedronPrecision[] = [
  'Grid Aligned',
  'Precise',
];

/** One face direction of the shape with the words shown on it. */
export interface GeneratorRhombicuboctahedronDirection {
  /** Readable direction with -1, 0 or 1 per axis, such as 1, 1, 0. */
  readonly readable: readonly [number, number, number];
  /** Unit direction. */
  readonly unit: THREE.Vector3;
  /** Lines of text on the face, such as +X or +X+Y and 45°. */
  readonly lines: readonly string[];
  /** 1 for an axis face, 2 for an edge face, 3 for a corner face. */
  readonly axes: 1 | 2 | 3;
}

/** Axis letters in order. */
const GENERATOR_RHOMBICUBOCTAHEDRON_AXES = ['X', 'Y', 'Z'] as const;

/**
 * Returns the far coordinate of a precision's corners: 2 keeps every corner on
 * whole numbers, 1 + √2 makes every face a regular polygon.
 *
 * @param precision Precision.
 * @returns Far coordinate; the near ones are 1.
 */
export function generatorRhombicuboctahedronExtent(precision: GeneratorRhombicuboctahedronPrecision): number {
  return precision === 'Precise' ? 1 + Math.SQRT2 : 2;
}

/**
 * Returns the 24 corners: every ordering of ±1, ±1 and ±extent.
 *
 * @param precision Precision.
 * @returns Corners about the origin, reaching ±extent on each axis.
 */
export function generatorRhombicuboctahedronPoints(precision: GeneratorRhombicuboctahedronPrecision): THREE.Vector3[] {
  const extent = generatorRhombicuboctahedronExtent(precision);
  const points: THREE.Vector3[] = [];
  for (let far = 0; far < 3; far++)
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        for (const c of [-1, 1]) {
          const coordinates = [a, b];
          coordinates.splice(far, 0, c * extent);
          points.push(new THREE.Vector3(...(coordinates as [number, number, number])));
        }
  return points;
}

/**
 * Returns the corners fitted into a box: the shape's extent meets every side.
 *
 * @param precision Precision.
 * @param box Box to fill.
 * @returns Corners inside the box.
 */
export function generatorRhombicuboctahedronPointsInBox(
  precision: GeneratorRhombicuboctahedronPrecision,
  box: THREE.Box3,
): THREE.Vector3[] {
  const center = box.getCenter(new THREE.Vector3());
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5 / generatorRhombicuboctahedronExtent(precision));
  return generatorRhombicuboctahedronPoints(precision).map((point) => point.multiply(half).add(center));
}

/**
 * Returns the 26 face directions: 6 axes, 12 edges and 8 corners.
 *
 * @returns Directions.
 */
export function generatorRhombicuboctahedronDirections(): GeneratorRhombicuboctahedronDirection[] {
  const directions: GeneratorRhombicuboctahedronDirection[] = [];
  for (const x of [1, -1, 0])
    for (const y of [1, -1, 0])
      for (const z of [1, -1, 0]) if (x || y || z) directions.push(generatorRhombicuboctahedronDirection([x, y, z]));
  return directions.sort((a, b) => a.axes - b.axes);
}

/**
 * Describes one face direction.
 *
 * @param readable Direction with -1, 0 or 1 per axis.
 * @returns Direction with its face text.
 */
function generatorRhombicuboctahedronDirection(
  readable: readonly [number, number, number],
): GeneratorRhombicuboctahedronDirection {
  const name = readable
    .map((value, axis) => (value === 0 ? '' : `${value > 0 ? '+' : '-'}${GENERATOR_RHOMBICUBOCTAHEDRON_AXES[axis]}`))
    .join('');
  const axes = readable.filter((value) => value !== 0).length as 1 | 2 | 3;
  return {
    readable,
    unit: new THREE.Vector3(...readable).normalize(),
    lines: axes === 2 ? [name, '45°'] : [name],
    axes,
  };
}
