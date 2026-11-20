import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptShapeMeshes, type SolidScriptShapeMesh } from '@/solid_script/language/solid_script_mesh.js';

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
 * Counts every directed edge of a mesh.
 *
 * @param mesh Mesh.
 * @returns Use count per "from:to" key.
 */
function directedEdges(mesh: SolidScriptShapeMesh): Map<string, number> {
  const edges = new Map<string, number>();
  for (const face of mesh.faces)
    face.forEach((from, corner) => {
      const key = `${from}:${face[(corner + 1) % face.length]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
  return edges;
}

/**
 * Counts edges whose two sides are not matched by exactly one face each, which
 * are cracks, open borders or folded seams.
 *
 * @param mesh Mesh.
 * @returns Number of unmatched directed edges.
 */
function unmatchedEdges(mesh: SolidScriptShapeMesh): number {
  const edges = directedEdges(mesh);
  let unmatched = 0;
  for (const [key, count] of edges) {
    const [from, to] = key.split(':');
    if (count !== 1 || edges.get(`${to}:${from}`) !== 1) unmatched += 1;
  }
  return unmatched;
}

/**
 * Euler characteristic of a mesh: 2 for one closed piece without handles.
 *
 * @param mesh Mesh.
 * @returns Points minus edges plus faces.
 */
function eulerCharacteristic(mesh: SolidScriptShapeMesh): number {
  return mesh.points.length - directedEdges(mesh).size / 2 + mesh.faces.length;
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
      expect(unmatchedEdges(mesh)).toBe(0);
      expect(eulerCharacteristic(mesh)).toBe(2);
      expect(closestPointGap(mesh)).toBeGreaterThan(1e-3);
      expect(enclosedVolume(mesh)).toBeCloseTo(boxesVolume(boxes), 6);
    });
  }

  for (const smooth of ['No', 'Yes'])
    for (let levels = 1; levels <= 4; levels++)
      it(`stays closed after Subdivide ${levels} with Smooth ${smooth} on the base with two crates`, () => {
        const mesh = bake(BASE_WITH_CRATES, subdivideLines(levels, smooth, null));
        expect(unmatchedEdges(mesh)).toBe(0);
        expect(eulerCharacteristic(mesh)).toBe(2);
        if (smooth === 'No') expect(enclosedVolume(mesh)).toBeCloseTo(boxesVolume(BASE_WITH_CRATES), 6);
      });

  for (const [name, boxes] of Object.entries(TOUCHING_SCENES))
    it(`opens no gaps when ${name} is subdivided and displaced`, () => {
      const mesh = bake(boxes, subdivideLines(3, 'Yes', '[=0.1 * Sin([$X] * 360)]'));
      expect(unmatchedEdges(mesh)).toBe(0);
      expect(eulerCharacteristic(mesh)).toBe(2);
      expect(closestPointGap(mesh)).toBeGreaterThan(1e-5);
    });

  it('keeps the flat subdivided top of the base on its plane, with no point lifted out of it', () => {
    const mesh = bake(BASE_WITH_CRATES, subdivideLines(2, 'No', null));
    const top = BASE_WITH_CRATES[0]!.size[1] / 2;
    const near = mesh.points.filter((point) => Math.abs(point.y - top) < 0.01);
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((point) => Math.abs(point.y - top) < 1e-6)).toBe(true);
  });
});
