import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptMeshLoopNormal,
  solidScriptShapeMeshes,
  type SolidScriptShapeMesh,
} from '@/solid_script/language/solid_script_mesh.js';
import { meshEulerCharacteristic, meshUnmatchedEdges } from './solid_script_mesh_checks.js';

/**
 * Watertightness of Mesh From Brushes: brushes that touch, stack or meet along
 * part of an edge must bake into one welded mesh in which every edge has
 * exactly one face on each side, also after Subdivide and Displace.
 */

const END: SolidScriptLine = { command: 'end' };

/** A box brush placed somewhere. */
interface TestBox {
  /** Size on X, Y and Z. */
  size: [number, number, number];
  /** Centre position. */
  at: [number, number, number];
}

/**
 * Script lines that place one centred box.
 *
 * @param box Box to place.
 * @returns Transform, Cube and End lines.
 */
function boxLines(box: TestBox): SolidScriptLine[] {
  return [
    { command: 'transform', values: { move: box.at.join(', ') } },
    { command: 'cube', values: { size: box.size.join(', '), anchor: 'Center, Center, Center' } },
    END,
  ];
}

/**
 * Runs Mesh From Brushes around boxes, followed by extra lines, and returns the
 * only mesh.
 *
 * @param boxes Boxes to bake.
 * @param after Lines run after the bake.
 * @returns Resulting mesh.
 */
function bake(boxes: readonly TestBox[], after: readonly SolidScriptLine[] = []): SolidScriptShapeMesh {
  const lines = [{ command: 'mesh_brushes' }, ...boxes.flatMap(boxLines), END, ...after];
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  expect(result.error?.message ?? null).toBeNull();
  const mesh = solidScriptShapeMeshes(result.shapes)[0];
  if (!mesh) throw new Error('Expected a mesh');
  return mesh;
}

/**
 * Subdivide lines, optionally followed by Displace.
 *
 * @param levels Subdivide levels.
 * @param smooth Smooth field text.
 * @param displace Distance formula, or null for no Displace.
 * @returns Script lines.
 */
function subdivideLines(levels: number, smooth: string, displace: string | null): SolidScriptLine[] {
  const lines: SolidScriptLine[] = [
    { command: 'select_brushes' },
    { command: 'subdivide', values: { levels: String(levels), smooth } },
  ];
  if (displace === null) return lines;
  return [...lines, { command: 'select_brushes' }, { command: 'displace', values: { distance: displace } }];
}

/**
 * Closest distance between two different points, which is zero when a corner
 * was left unwelded.
 *
 * @param mesh Mesh.
 * @returns Smallest gap between points.
 */
function closestPointGap(mesh: SolidScriptShapeMesh): number {
  const sorted = mesh.points.map((point) => point.clone()).sort((a, b) => a.x - b.x);
  let closest = Infinity;
  for (let index = 0; index < sorted.length; index++)
    for (let other = index + 1; other < sorted.length && sorted[other]!.x - sorted[index]!.x < closest; other++)
      closest = Math.min(closest, sorted[index]!.distanceTo(sorted[other]!));
  return closest;
}

/**
 * Sum of the signed volumes under every face, the enclosed volume of a closed
 * outward mesh.
 *
 * @param mesh Mesh.
 * @returns Volume in cubic metres.
 */
function enclosedVolume(mesh: SolidScriptShapeMesh): number {
  let volume = 0;
  for (const face of mesh.faces)
    for (let corner = 1; corner + 1 < face.length; corner++) {
      const [a, b, c] = [face[0]!, face[corner]!, face[corner + 1]!].map((index) => mesh.points[index]!);
      volume += a!.dot(new THREE.Vector3().crossVectors(b!, c!)) / 6;
    }
  return volume;
}

/**
 * Sum of box volumes, for boxes that do not overlap.
 *
 * @param boxes Boxes.
 * @returns Volume in cubic metres.
 */
function boxesVolume(boxes: readonly TestBox[]): number {
  return boxes.reduce((sum, box) => sum + box.size[0] * box.size[1] * box.size[2], 0);
}

/**
 * Turn at every corner of a face, in degrees, signed by the face's own normal:
 * a positive turn bends the outline the face's way, 0 is a corner in the middle
 * of a straight side and a negative turn is a fold.
 *
 * @param mesh Mesh.
 * @param face Face corners.
 * @returns Turn per corner.
 */
function cornerTurns(mesh: SolidScriptShapeMesh, face: readonly number[]): number[] {
  const normal = solidScriptMeshLoopNormal(mesh.points, face);
  return face.map((index, corner) => {
    const point = mesh.points[index]!;
    const incoming = point.clone().sub(mesh.points[face[(corner + face.length - 1) % face.length]!]!);
    const outgoing = mesh.points[face[(corner + 1) % face.length]!]!.clone().sub(point);
    const sine = new THREE.Vector3().crossVectors(incoming, outgoing).dot(normal);
    return THREE.MathUtils.radToDeg(Math.atan2(sine, incoming.dot(outgoing)));
  });
}

/**
 * Counts faces with a corner that turns less than a number of degrees, which
 * are faces with a corner in the middle of a side, or folded faces.
 *
 * @param mesh Mesh.
 * @param degrees Smallest turn a corner must make.
 * @returns Faces with a smaller turn somewhere.
 */
function facesTurningLess(mesh: SolidScriptShapeMesh, degrees: number): number {
  return mesh.faces.filter((face) => cornerTurns(mesh, face).some((turn) => turn < degrees)).length;
}

/** A wide base with two crates of different sizes standing on its top. */
const BASE_WITH_CRATES: TestBox[] = [
  { size: [4, 1, 4], at: [0, 0, 0] },
  { size: [1, 1, 1], at: [-1, 1, -0.5] },
  { size: [0.75, 0.75, 0.75], at: [1, 0.875, 0.7] },
];

/** Scenes whose brushes meet in ways that leave corners inside other edges. */
const TOUCHING_SCENES: Record<string, TestBox[]> = {
  'base with two crates': BASE_WITH_CRATES,
  'three stacked boxes, each smaller': [
    { size: [3, 1, 3], at: [0, 0, 0] },
    { size: [2, 1, 2], at: [0.25, 1, 0] },
    { size: [1, 1, 1], at: [0.25, 2, -0.25] },
  ],
  'a long box beside two short ones, a T-junction along the edge': [
    { size: [2, 1, 1], at: [0, 0, 0] },
    { size: [1, 1, 1], at: [-0.5, 0, 1] },
    { size: [1, 1, 1], at: [0.5, 0, 1] },
  ],
  'a tall and a short box sharing their bottom edge': [
    { size: [1, 2, 1], at: [0, 1, 0] },
    { size: [1, 1, 1], at: [1, 0.5, 0] },
  ],
  'boxes touching with offset faces on two axes': [
    { size: [2, 2, 2], at: [0, 0, 0] },
    { size: [1, 1, 1], at: [1.5, 0.3, -0.2] },
    { size: [1, 1, 1], at: [-0.4, 1.5, 0.6] },
  ],
};

describe('SolidScript Mesh From Brushes watertight bake', () => {
  for (const [name, boxes] of Object.entries(TOUCHING_SCENES)) {
    it(`bakes ${name} into one closed welded mesh`, () => {
      const mesh = bake(boxes);
      expect(meshUnmatchedEdges(mesh)).toBe(0);
      expect(meshEulerCharacteristic(mesh)).toBe(2);
      expect(closestPointGap(mesh)).toBeGreaterThan(1e-3);
      expect(enclosedVolume(mesh)).toBeCloseTo(boxesVolume(boxes), 6);
    });
  }

  for (const smooth of ['No', 'Yes'])
    for (let levels = 1; levels <= 4; levels++)
      it(`stays closed after Subdivide ${levels} with Smooth ${smooth} on the base with two crates`, () => {
        const mesh = bake(BASE_WITH_CRATES, subdivideLines(levels, smooth, null));
        expect(meshUnmatchedEdges(mesh)).toBe(0);
        expect(meshEulerCharacteristic(mesh)).toBe(2);
        if (smooth === 'No') expect(enclosedVolume(mesh)).toBeCloseTo(boxesVolume(BASE_WITH_CRATES), 6);
      });

  for (const [name, boxes] of Object.entries(TOUCHING_SCENES))
    it(`opens no gaps when ${name} is subdivided and displaced`, () => {
      const mesh = bake(boxes, subdivideLines(3, 'Yes', '[=0.1 * Sin([$X] * 360)]'));
      expect(meshUnmatchedEdges(mesh)).toBe(0);
      expect(meshEulerCharacteristic(mesh)).toBe(2);
      expect(closestPointGap(mesh)).toBeGreaterThan(1e-5);
    });

  for (const [name, boxes] of Object.entries(TOUCHING_SCENES))
    it(`bakes ${name} with no corner left in the middle of a side`, () => {
      const mesh = bake(boxes);
      expect(facesTurningLess(mesh, 1)).toBe(0);
      expect(mesh.uvs.every((uvs, index) => uvs !== null && uvs.length === mesh.faces[index]!.length)).toBe(true);
    });

  for (let levels = 1; levels <= 3; levels++)
    it(`subdivides the base with two crates ${levels} times, flat, into only well-turned convex quads`, () => {
      const mesh = bake(BASE_WITH_CRATES, subdivideLines(levels, 'No', null));
      expect(mesh.faces.every((face) => face.length === 4)).toBe(true);
      expect(facesTurningLess(mesh, 10)).toBe(0);
    });

  for (const levels of [2, 4])
    it(`folds no face when the base with two crates is smoothed ${levels} times and displaced`, () => {
      const mesh = bake(BASE_WITH_CRATES, subdivideLines(levels, 'Yes', '[=0.1 * Sin([$X] * 360)]'));
      expect(meshUnmatchedEdges(mesh)).toBe(0);
      expect(facesTurningLess(mesh, 0)).toBe(0);
    });

  it('stays closed with a crate turned on the base, where faces of other shapes keep their extra corners', () => {
    const lines: SolidScriptLine[] = [
      { command: 'mesh_brushes' },
      ...boxLines(BASE_WITH_CRATES[0]!),
      { command: 'transform', values: { move: '0.5, 1, 0.3', rotate: '0, 30, 0' } },
      { command: 'cube', values: { size: '1, 1, 1', anchor: 'Center, Center, Center' } },
      END,
      END,
      ...subdivideLines(2, 'Yes', '[=0.1 * Sin([$X] * 360)]'),
    ];
    const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
    expect(result.error?.message ?? null).toBeNull();
    const mesh = solidScriptShapeMeshes(result.shapes)[0];
    if (!mesh) throw new Error('Expected a mesh');
    expect(meshUnmatchedEdges(mesh)).toBe(0);
    expect(meshEulerCharacteristic(mesh)).toBe(2);
  });

  it('keeps the flat subdivided top of the base on its plane, with no point lifted out of it', () => {
    const mesh = bake(BASE_WITH_CRATES, subdivideLines(2, 'No', null));
    const top = BASE_WITH_CRATES[0]!.size[1] / 2;
    const near = mesh.points.filter((point) => Math.abs(point.y - top) < 0.01);
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((point) => Math.abs(point.y - top) < 1e-6)).toBe(true);
  });
});
