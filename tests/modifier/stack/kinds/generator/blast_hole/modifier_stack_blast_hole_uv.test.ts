import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierGeneratorOperationCommand } from '@/modifier/stack/modifier_generator_operation.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  BlastHoleUvWrap,
  blastHoleUvArcStarts,
  blastHoleUvSplitRow,
} from '@/modifier/stack/kinds/generator/blast_hole/modifier_stack_blast_hole_uv.js';

/** Largest UV gap, in tiles, that still counts as continuous. */
const UV_CONTINUOUS = 1e-6;

/** Largest difference between U and V texel density, as a fraction. */
const UV_MAX_STRETCH = 1e-6;

/** One cut face of a generated piece, in model space. */
interface CutFace {
  /** UV matrix in model space. */
  uv: SurfaceUvMatrix;
  /** Outward normal. */
  normal: THREE.Vector3;
  /** Front corners, the ends of the face's outline edge. */
  ends: THREE.Vector3[];
  /** Index of the piece it belongs to. */
  piece: number;
}

/**
 * Builds Henry's wall: a 3 x 2 x 0.25 m wall with a Jagged Blast Hole box
 * through it, and compiles it.
 *
 * @param patch Blast Hole parameters.
 * @returns Generated pieces in order.
 */
function henryWall(patch: Record<string, unknown> = {}): SolidBrushInstance[] {
  const world = new THREE.Group();
  const model = new SolidModel('Henry wall');
  world.add(model.root);
  const wall = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  wall.mesh?.scale.set(3, 2, 0.25);
  wall.mesh?.position.set(0.25, 0.5, -0.375);
  const node = modifierGeneratorNodeCreate('blastHole');
  node.scale.set(3, 1.5, 0.25);
  node.position.set(0.25, 0.5, -0.375);
  model.root.add(node);
  modifierGeneratorOperationCommand(node, SolidOperation.Subtractive)?.execute();
  const settings = ModifierVolume.read(node);
  const [hole] = settings.modifiers;
  if (!hole) throw new Error('no Blast Hole step');
  hole.parameters = { ...hole.parameters, style: 'jagged', seed: 1, ...patch };
  ModifierVolume.write(node, settings);
  world.updateMatrixWorld(true);
  return modifierStackCompile(model.getBrushes(), model.root).instances.filter((b) => b.id.startsWith(`${node.uuid}#`));
}

/**
 * Lists the cut faces (faces across the wall) of pieces.
 *
 * @param pieces Generated pieces.
 * @returns Cut faces.
 */
function cutFaces(pieces: readonly SolidBrushInstance[]): CutFace[] {
  return pieces.flatMap((brush, piece) => {
    const solid = brush.getModelSpaceBrush();
    return solid.faces.flatMap((face, index) => {
      const normal = solid.planes[index]?.normal ?? new THREE.Vector3();
      if (Math.abs(normal.z) > 0.5) return [];
      const corners = solid.getFaceVertexIndices(face).map((corner) => solid.vertices[corner] ?? new THREE.Vector3());
      const ends = corners.filter((corner) => corner.z > -0.3);
      return [{ uv: brush.getFaceSurface(face.surfaceIndex).uv, normal, ends, piece }];
    });
  });
}

/**
 * Returns whether a point lies on a face's outline edge.
 *
 * @param point Point.
 * @param face Cut face.
 * @returns True on the edge.
 */
function onEdge(point: THREE.Vector3, face: CutFace): boolean {
  const [a, b] = face.ends;
  if (!a || !b) return false;
  const line = new THREE.Line3(a, b);
  return line.closestPointToPoint(point, true, new THREE.Vector3()).distanceTo(point) < 1e-5;
}

/**
 * Splits cut faces into those on the hole outline and those between pieces.
 *
 * @param faces Cut faces.
 * @returns Outline faces and split faces.
 */
function splitFaces(faces: readonly CutFace[]): { outline: CutFace[]; split: CutFace[] } {
  const between = (face: CutFace): boolean => {
    const [a, b] = face.ends;
    const middle = a && b ? a.clone().add(b).multiplyScalar(0.5) : new THREE.Vector3();
    return faces.some((other) => other.normal.dot(face.normal) < -0.9999 && onEdge(middle, other));
  };
  return { outline: faces.filter((face) => !between(face)), split: faces.filter(between) };
}

/**
 * Measures the UV gap between two faces at a shared corner, at the front and
 * the back of the wall.
 *
 * @param a Face.
 * @param b Face.
 * @param corner Shared front corner.
 * @returns Largest gap in tiles.
 */
function gapAt(a: CutFace, b: CutFace, corner: THREE.Vector3): number {
  return Math.max(
    ...[-0.25, -0.5].map((z) => {
      const point = new THREE.Vector3(corner.x, corner.y, z);
      const [p, q] = [a.uv.project(point), b.uv.project(point)];
      return Math.hypot(p.u - q.u, p.v - q.v);
    }),
  );
}

/**
 * Lists the UV gaps at every corner two outline faces share.
 *
 * @param outline Outline faces.
 * @returns Gaps in tiles.
 */
function outlineGaps(outline: readonly CutFace[]): number[] {
  const gaps: number[] = [];
  for (const a of outline)
    for (const b of outline)
      for (const corner of a === b ? [] : a.ends)
        if (b.ends.some((end) => end.distanceTo(corner) < 1e-5)) gaps.push(gapAt(a, b, corner));
  return gaps;
}

/**
 * Measures the texel density of a face along its outline edge and across the
 * wall, in tiles per metre.
 *
 * @param face Cut face.
 * @returns Density along and across.
 */
function density(face: CutFace): [number, number] {
  const [a, b] = face.ends;
  if (!a || !b) return [0, 0];
  const origin = face.uv.project(a);
  const along = face.uv.project(a.clone().add(b.clone().sub(a).normalize()));
  const across = face.uv.project(a.clone().add(new THREE.Vector3(0, 0, -1)));
  return [Math.hypot(along.u - origin.u, along.v - origin.v), Math.hypot(across.u - origin.u, across.v - origin.v)];
}

/**
 * Returns whether two cut faces lie on one cut: one's outline edge lies along
 * the other's.
 *
 * @param a Face.
 * @param b Face.
 * @returns True on one cut.
 */
function sameCut(a: CutFace, b: CutFace): boolean {
  return a.ends.every((end) => onEdge(end, b)) || b.ends.every((end) => onEdge(end, a));
}

describe('Blast Hole cut face UVs', () => {
  it('measures the outline from its highest point', () => {
    const square = [
      new THREE.Vector2(-1, -1),
      new THREE.Vector2(1, -1),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(-1, 1),
    ];
    expect(blastHoleUvArcStarts(square)).toEqual([4, 6, 0, 2]);
  });

  it('wraps U on without a break from one outline edge to the next', () => {
    const square = [
      new THREE.Vector2(-1, -1),
      new THREE.Vector2(1, -1),
      new THREE.Vector2(1, 1),
      new THREE.Vector2(-1, 1),
    ];
    const wrap = new BlastHoleUvWrap(square);
    const u = (row: THREE.Vector4 | null, p: THREE.Vector2): number => (row ? row.x * p.x + row.y * p.y + row.w : NaN);
    const bottom = wrap.rowOn(new THREE.Vector2(-0.5, -1), new THREE.Vector2(0.5, -1));
    const right = wrap.rowOn(new THREE.Vector2(1, -1), new THREE.Vector2(1, 0));
    expect(u(bottom, new THREE.Vector2(1, -1))).toBeCloseTo(u(right, new THREE.Vector2(1, -1)), 9);
    expect(u(right, new THREE.Vector2(1, -1))).toBeCloseTo(6, 9);
    expect(wrap.rowOn(new THREE.Vector2(0, 0), new THREE.Vector2(1, 0))).toBeNull();
  });

  it('gives both sides of a split the same U row', () => {
    const normal = new THREE.Vector3(0.6, -0.8, 0);
    expect(blastHoleUvSplitRow(normal).toArray()).toEqual(blastHoleUvSplitRow(normal.clone().negate()).toArray());
  });

  it('keeps the texture unbroken around Henry’s hole, apart from one seam', () => {
    const { outline } = splitFaces(cutFaces(henryWall()));
    const gaps = outlineGaps(outline);
    const broken = gaps.filter((gap) => gap > UV_CONTINUOUS);
    expect(outline.length).toBeGreaterThan(20);
    expect(gaps.length).toBeGreaterThanOrEqual(2 * outline.length);
    expect(broken.length).toBeLessThanOrEqual(4);
    expect(new Set(broken.map((gap) => gap.toFixed(6))).size).toBeLessThanOrEqual(1);
  });

  it('lays one tile per metre on every cut face, without stretching', () => {
    for (const face of cutFaces(henryWall())) {
      const [along, across] = density(face);
      expect(along).toBeCloseTo(1, 9);
      expect(Math.abs(along - across) / along).toBeLessThan(UV_MAX_STRETCH);
    }
  });

  it('honours the texture scale', () => {
    const faces = cutFaces(henryWall({ textureScaleU: 0.25, textureScaleV: 0.5 }));
    for (const face of faces) expect(density(face).map((value) => +value.toFixed(9))).toEqual([4, 2]);
    const { outline } = splitFaces(faces);
    expect(outlineGaps(outline).filter((gap) => gap > UV_CONTINUOUS).length).toBeLessThanOrEqual(4);
  });

  it('gives the two faces of every cut the same UVs', () => {
    const pieces = henryWall({ fillBack: true });
    const count = pieces.length / 2;
    const faces = cutFaces(pieces);
    const { split } = splitFaces(faces.filter((face) => face.piece < count));
    expect(split.length).toBeGreaterThan(0);
    let twins = 0;
    for (const face of split) {
      const twin = split.find((other) => other.normal.dot(face.normal) < -1 + 1e-9 && sameCut(face, other));
      if (!twin) continue;
      twins += 1;
      for (const end of face.ends) expect(gapAt(face, twin, end)).toBeLessThan(UV_CONTINUOUS);
    }
    expect(twins).toBeGreaterThan(0);
    for (const face of faces.filter((cut) => cut.piece >= count)) {
      const cutFace = faces.find(
        (other) => other.piece === face.piece - count && other.normal.distanceTo(face.normal) < 1e-9,
      );
      expect(cutFace).toBeDefined();
      for (const end of face.ends) expect(cutFace ? gapAt(face, cutFace, end) : 1).toBeLessThan(UV_CONTINUOUS);
    }
  });

  it('builds the same UVs every time', () => {
    const rows = (pieces: SolidBrushInstance[]): number[][] =>
      cutFaces(pieces).flatMap((face) => [face.uv.u.toArray(), face.uv.v.toArray()]);
    expect(rows(henryWall())).toEqual(rows(henryWall()));
  });

  it('runs bricks along their length with V across the wall', () => {
    for (const face of cutFaces(henryWall({ style: 'bricks' }))) {
      const [along, across] = density(face);
      expect([along, across].map((value) => +value.toFixed(9))).toEqual([1, 1]);
      expect(Math.abs(face.uv.v.z)).toBeCloseTo(1, 9);
    }
  });
});
