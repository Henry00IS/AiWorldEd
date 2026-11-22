import * as THREE from 'three';

/**
 * A sphere of triangles: corners on the unit sphere and corner numbers per
 * face.
 */
export interface GeneratorIcosphereShape {
  /** Corners, each 1 from the origin. */
  points: THREE.Vector3[];
  /** Triangles, corners counter-clockwise seen from outside. */
  faces: [number, number, number][];
}

/** Fewest and most Subdivisions: 1 is the icosahedron itself. */
export const GENERATOR_ICOSPHERE_SUBDIVISIONS = { min: 1, max: 7 } as const;

/**
 * Builds a sphere from an icosahedron with a corner at the top and bottom:
 * every Subdivision past the first splits each triangle into four, pushing the
 * new corners out onto the sphere, so it has 20 × 4^(Subdivisions − 1) faces.
 *
 * @param subdivisions Whole number from 1.
 * @returns Shape on the unit sphere.
 */
export function generatorIcosphere(subdivisions: number): GeneratorIcosphereShape {
  let shape = generatorIcosphereBase();
  for (let level = 1; level < subdivisions; level++) shape = generatorIcosphereSplit(shape);
  return shape;
}

/**
 * Builds the icosahedron: a top and a bottom corner and two rings of five
 * between them, turned 36° from each other.
 *
 * @returns Twelve corners and twenty triangles.
 */
function generatorIcosphereBase(): GeneratorIcosphereShape {
  const height = 1 / Math.sqrt(5);
  const ring = (y: number, turn: number) =>
    Array.from({ length: 5 }, (_, index) => {
      const angle = ((index * 72 + turn) * Math.PI) / 180;
      return new THREE.Vector3(Math.cos(angle) * 2 * height, y, Math.sin(angle) * 2 * height);
    });
  const points = [new THREE.Vector3(0, 1, 0), ...ring(height, 0), ...ring(-height, 36), new THREE.Vector3(0, -1, 0)];
  const faces = Array.from({ length: 5 }, (_, index): [number, number, number][] => {
    const [up, upNext, down, downNext] = [1 + index, 1 + ((index + 1) % 5), 6 + index, 6 + ((index + 1) % 5)];
    return [
      [0, up, upNext],
      [up, down, upNext],
      [upNext, down, downNext],
      [down, 11, downNext],
    ];
  }).flat();
  return { points, faces: faces.map((face) => generatorIcosphereOutward(points, face)) };
}

/**
 * Splits every triangle into four at its edge middles, pushed onto the sphere.
 *
 * @param shape Shape to split.
 * @returns Finer shape; the old corners keep their numbers.
 */
function generatorIcosphereSplit(shape: GeneratorIcosphereShape): GeneratorIcosphereShape {
  const points = shape.points.map((point) => point.clone());
  const middles = new Map<string, number>();
  const middle = (a: number, b: number): number => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const known = middles.get(key);
    if (known !== undefined) return known;
    const point = (points[a] ?? new THREE.Vector3())
      .clone()
      .add(points[b] ?? new THREE.Vector3())
      .normalize();
    middles.set(key, points.push(point) - 1);
    return points.length - 1;
  };
  const faces = shape.faces.flatMap(([a, b, c]): [number, number, number][] => {
    const [ab, bc, ca] = [middle(a, b), middle(b, c), middle(c, a)];
    return [
      [a, ab, ca],
      [ab, b, bc],
      [ca, bc, c],
      [ab, bc, ca],
    ];
  });
  return { points, faces };
}

/**
 * Orders a triangle's corners counter-clockwise seen from outside the sphere.
 *
 * @param points Corners.
 * @param face Triangle.
 * @returns The triangle, turned around when it faced inwards.
 */
function generatorIcosphereOutward(
  points: readonly THREE.Vector3[],
  face: [number, number, number],
): [number, number, number] {
  const [a, b, c] = face.map((index) => points[index] ?? new THREE.Vector3());
  if (!a || !b || !c) return face;
  const normal = b.clone().sub(a).cross(c.clone().sub(a));
  return normal.dot(a.clone().add(b).add(c)) >= 0 ? face : [face[0], face[2], face[1]];
}
