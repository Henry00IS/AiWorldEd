import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidCsgCoverageCheck, type SolidCsgCoverageBrush } from './solid_csg_coverage_oracle.js';
import blastedBrickWall from './fixtures/blasted_brick_wall.json';

/** One brush of the blasted brick wall fixture, in model space. */
interface BlastedBrickWallBrush {
  name: string;
  vertices: number[];
  faces: number[][];
}

/** Brushes Henry reported with missing top faces. */
const BLASTED_WALL_MISSING_TOP = ['Brush.A25', 'Brush.CAF', 'Brush.4A3', 'Brush.ACB'];

/** Brushes Henry reported with missing side faces. */
const BLASTED_WALL_MISSING_SIDE = ['Brush.FFF', 'Brush.E61', 'Brush.EF5', 'Brush.D75', 'Brush.0EB'];

/**
 * Builds one fixture brush from its model-space vertices and face index loops.
 *
 * @param entry Fixture brush.
 * @returns Convex brush.
 */
function fixtureBrush(entry: BlastedBrickWallBrush): SolidBrush {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index + 2 < entry.vertices.length; index += 3) {
    points.push(new THREE.Vector3(entry.vertices[index], entry.vertices[index + 1], entry.vertices[index + 2]));
  }
  const brush = SolidBrushFactory.createFromFaceLoops(entry.faces.map((loop) => loop.map((at) => points[at]!)));
  if (!brush) throw new Error(`fixture brush ${entry.name} does not close`);
  return brush;
}

/**
 * Wraps model-space brushes as additive instances with identity transforms.
 *
 * @param brushes Named brushes.
 * @returns Instances in the same order.
 */
function additiveInstances(brushes: readonly SolidCsgCoverageBrush[]): SolidBrushInstance[] {
  return brushes.map(({ id, name, brush }) => new SolidBrushInstance(id, name, brush, SolidOperation.Additive));
}

/**
 * Compiles a union of model-space brushes and checks its surface coverage.
 *
 * @param brushes Named brushes.
 * @returns Coverage report.
 */
function compileAndCheck(brushes: readonly SolidCsgCoverageBrush[]) {
  const polygons = new SolidCsgCompiler().compile(additiveInstances(brushes), { forceFull: true });
  return solidCsgCoverageCheck(brushes, polygons);
}

/**
 * Builds a box brush rotated by small angles about its centre and moved.
 *
 * @param size Box edge lengths.
 * @param centre Box centre.
 * @param tilt Rotation in radians about X, Y and Z.
 * @returns Box brush in model space.
 */
function tiltedBox(size: THREE.Vector3, centre: THREE.Vector3, tilt: THREE.Euler): SolidBrush {
  const brush = SolidBrushFactory.createCenteredBox(size.x, size.y, size.z);
  brush.transformVertices(
    new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromEuler(tilt), new THREE.Vector3(1, 1, 1)),
  );
  return brush;
}

/**
 * Builds the reduced case from the scene: a brick, a neighbour brick flush
 * beside it one row up, and a brick resting tilted on both, slid back so the
 * front strip of the lower brick's top stays open.
 *
 * @param tilt Tilt of the resting brick.
 * @param sink How far the resting brick sinks into the lower one, in metres.
 * @returns Named brushes.
 */
function restingBrickTrio(tilt: THREE.Euler, sink: number): SolidCsgCoverageBrush[] {
  const brick = new THREE.Vector3(0.4, 0.2, 0.8);
  const lower = tiltedBox(brick, new THREE.Vector3(0, 0, 0), new THREE.Euler());
  const neighbour = tiltedBox(brick, new THREE.Vector3(0.2, 0.2, 0), new THREE.Euler());
  const resting = tiltedBox(brick, new THREE.Vector3(-0.2, 0.2 - sink, -0.2), tilt);
  return [
    { id: 'lower', name: 'lower', brush: lower },
    { id: 'resting', name: 'resting', brush: resting },
    { id: 'neighbour', name: 'neighbour', brush: neighbour },
  ];
}

describe('CSG of pieces resting tilted against each other', () => {
  const fixture = (blastedBrickWall as { brushes: BlastedBrickWallBrush[] }).brushes;
  const wall = fixture.map((entry) => ({ id: entry.name, name: entry.name, brush: fixtureBrush(entry) }));

  it('every fixture brush is a closed convex solid with sound faces', () => {
    for (const { brush } of wall) {
      expect(brush.faces.length).toBe(6);
      for (const plane of brush.planes)
        for (const vertex of brush.vertices) expect(plane.signedDistance(vertex)).toBeLessThan(1e-6);
    }
  });

  it('keeps every visible face of the blasted brick wall, including the reported brushes', () => {
    const report = compileAndCheck(wall);
    const reported = [...BLASTED_WALL_MISSING_TOP, ...BLASTED_WALL_MISSING_SIDE];
    expect(report.missingFaces.filter((face) => reported.includes(face.split(':')[0]!))).toEqual([]);
    expect(report.missingSamples).toBe(0);
    expect(report.extraPolygons).toBe(0);
  });

  it.each([
    [0.002, 0, 0.001],
    [-0.002, 0, 0.001],
    [0.003, 0.001, -0.002],
    [0, 0.002, 0.004],
    [-0.004, -0.001, 0],
  ])('keeps the open part of a brick top when a neighbour rests tilted by (%s, %s, %s) rad', (x, y, z) => {
    for (const sink of [0, 0.0004, 0.001]) {
      const report = compileAndCheck(restingBrickTrio(new THREE.Euler(x, y, z), sink));
      expect(report.missingSamples).toBe(0);
      expect(report.extraPolygons).toBe(0);
    }
  });
});
