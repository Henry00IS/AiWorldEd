import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';

/**
 * Builds the pieces of one generator node in a solid of its own.
 *
 * @param kind Generator kind.
 * @param size Node box size.
 * @param parameters Parameter overrides.
 * @returns Generated pieces and the node box in solid coordinates.
 */
export function primitivePieces(
  kind: string,
  size: readonly [number, number, number],
  parameters: Record<string, unknown> = {},
): { pieces: SolidBrushInstance[]; box: THREE.Box3 } {
  const world = new THREE.Group();
  const model = new SolidModel('Primitive test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(kind);
  node.scale.set(...size);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error(`No generator step for ${kind}`);
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first, parameters: { ...first.parameters, ...parameters } }, ...rest],
  });
  world.updateMatrixWorld(true);
  const pieces = modifierStackCompile(model.getBrushes(), model.root).instances.filter((brush) =>
    brush.id.startsWith(`${node.uuid}#`),
  );
  return { pieces, box: new THREE.Box3().setFromObject(node) };
}

/**
 * Returns the enclosed volume of a closed convex brush.
 *
 * @param piece Brush.
 * @returns Volume in cubic metres.
 */
export function primitiveVolume(piece: SolidBrushInstance): number {
  let volume = 0;
  for (const face of piece.brush.faces) {
    const [first, ...rest] = piece.brush.getFaceVertices(face);
    if (!first) continue;
    for (let index = 0; index + 1 < rest.length; index++) {
      const b = rest[index];
      const c = rest[index + 1];
      if (b && c) volume += first.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    }
  }
  return Math.abs(volume);
}

/**
 * Returns the summed volume of pieces.
 *
 * @param pieces Brushes.
 * @returns Volume in cubic metres.
 */
export function primitiveTotalVolume(pieces: readonly SolidBrushInstance[]): number {
  return pieces.reduce((sum, piece) => sum + primitiveVolume(piece), 0);
}

/** One face of a piece with the texture coordinates of its corners. */
export interface PrimitiveMappedFace {
  normal: THREE.Vector3;
  corners: { point: THREE.Vector3; uv: THREE.Vector2 }[];
}

/**
 * Evaluates the texture coordinates of every face corner of every piece.
 *
 * @param pieces Brushes.
 * @returns Mapped faces.
 */
export function primitiveMappedFaces(pieces: readonly SolidBrushInstance[]): PrimitiveMappedFace[] {
  return pieces.flatMap((piece) =>
    piece.brush.faces.map((face, index) => {
      const surface = piece.getFaceSurface(face.surfaceIndex);
      const corners = piece.brush.getFaceVertices(face).map((point) => {
        const row = (vector: THREE.Vector4) => vector.x * point.x + vector.y * point.y + vector.z * point.z + vector.w;
        return { point, uv: new THREE.Vector2(row(surface.uv.u), row(surface.uv.v)) };
      });
      return { normal: piece.brush.planes[index]?.normal.clone() ?? new THREE.Vector3(), corners };
    }),
  );
}

/**
 * Returns the largest texture jump where two gently angled faces share an edge,
 * comparing coordinates modulo whole repeats so a closing seam counts as
 * continuous.
 *
 * @param faces Mapped faces.
 * @param maxAngle Largest angle between faces that count as one surface, in
 *   degrees.
 * @param ignored Returns true for corners left out, such as poles where every
 *   wrap meets.
 * @returns Largest jump in texture units.
 */
export function primitiveSeamJump(
  faces: readonly PrimitiveMappedFace[],
  maxAngle: number,
  ignored: (point: THREE.Vector3) => boolean = () => false,
): number {
  const limit = Math.cos(THREE.MathUtils.degToRad(maxAngle));
  const wrapped = (value: number) => Math.abs(value - Math.round(value));
  let worst = 0;
  faces.forEach((face, index) => {
    for (const other of faces.slice(index + 1)) {
      if (face.normal.dot(other.normal) < limit || face.normal.dot(other.normal) > 1 - 1e-9) continue;
      const shared = face.corners.flatMap((corner) => {
        if (ignored(corner.point)) return [];
        const match = other.corners.find((candidate) => candidate.point.distanceTo(corner.point) < 1e-5);
        return match ? [{ a: corner.uv, b: match.uv }] : [];
      });
      if (shared.length < 1) continue;
      for (const { a, b } of shared) worst = Math.max(worst, wrapped(a.x - b.x), wrapped(a.y - b.y));
    }
  });
  return worst;
}
