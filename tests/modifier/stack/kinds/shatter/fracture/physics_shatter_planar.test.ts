import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import type { SolidBrush } from '@/solid/brush/solid_brush.js';
import { physicsShatterFracture } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_fracture.js';
import { physicsShatterBrushVolume } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_geometry.js';
import { physicsShatterMidPlane } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_plane.js';
import type {
  PhysicsShatterPiece,
  PhysicsShatterResult,
} from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_types.js';
import { PHYSICS_SHATTER_MIN_EDGE } from '@/modifier/stack/kinds/shatter/fracture/physics_shatter_quality.js';
import {
  physicsShatterTestExpectSound,
  physicsShatterTestInputs,
  physicsShatterTestSettings,
  physicsShatterTestWall,
} from './physics_shatter_fixtures.js';

/**
 * Expects every piece to be a prism through the thickness: every crack face
 * stands square to the normal and every piece spans the full thickness.
 *
 * @param result Fracture result.
 * @param normal Thickness direction.
 * @param input Input brush.
 */
function planarExpectPrisms(result: PhysicsShatterResult, normal: THREE.Vector3, input: SolidBrush): void {
  const span = (brush: SolidBrush): [number, number] => {
    const along = brush.vertices.map((vertex) => vertex.dot(normal));
    return [Math.min(...along), Math.max(...along)];
  };
  const [low, high] = span(input);
  for (const piece of result.pieces) {
    piece.faces.forEach((origin, index) => {
      if (origin.kind !== 'crack') return;
      expect(Math.abs(piece.brush.planes[index]?.normal.dot(normal) ?? 1)).toBeLessThan(1e-6);
    });
    const [pieceLow, pieceHigh] = span(piece.brush);
    expect(pieceLow).toBeCloseTo(low, 6);
    expect(pieceHigh).toBeCloseTo(high, 6);
  }
}

/**
 * Sums piece volumes.
 *
 * @param pieces Pieces.
 * @returns Volume.
 */
function planarVolume(pieces: readonly PhysicsShatterPiece[]): number {
  return pieces.reduce((sum, piece) => sum + piece.volume, 0);
}

/**
 * Measures how long a piece is along the line from the impact against how wide
 * it is across it, in the XY plane.
 *
 * @param piece Piece.
 * @param impact Impact point.
 * @returns Length over width.
 */
function planarAspect(piece: PhysicsShatterPiece, impact: THREE.Vector3): number {
  const radial = new THREE.Vector3().subVectors(piece.centroid, impact).setZ(0).normalize();
  const across = new THREE.Vector3(-radial.y, radial.x, 0);
  const extent = (direction: THREE.Vector3): number => {
    const along = piece.brush.vertices.map((vertex) => vertex.dot(direction));
    return Math.max(...along) - Math.min(...along);
  };
  return extent(radial) / Math.max(1e-9, extent(across));
}

describe('physics shatter 2D cracks', () => {
  const pane = physicsShatterTestWall(2, 1.5, 0.01);
  const z = new THREE.Vector3(0, 0, 1);

  it('breaks a thin pane into prisms through its thickness, about one per crack size square', () => {
    const settings = physicsShatterTestSettings({ crackSize: 0.2, cracks: '2d' });
    const result = physicsShatterFracture(physicsShatterTestInputs(pane), settings);
    expect(result.pieces.length).toBeGreaterThan(45);
    expect(result.pieces.length).toBeLessThan(90);
    planarExpectPrisms(result, z, pane);
    expect(planarVolume(result.pieces)).toBeCloseTo(physicsShatterBrushVolume(pane), 9);
    physicsShatterTestExpectSound(result, 0.2, PHYSICS_SHATTER_MIN_EDGE, 0.01);
  });

  it('never cuts along the thickness, even of a thick block', () => {
    const block = SolidBrushFactory.createBox(new THREE.Vector3(-1, 0, -0.3), new THREE.Vector3(1, 2, 0.3));
    const settings = physicsShatterTestSettings({ crackSize: 0.4, cracks: '2d', seed: 3 });
    const result = physicsShatterFracture(physicsShatterTestInputs(block), settings);
    planarExpectPrisms(result, z, block);
    const chunks = physicsShatterFracture(physicsShatterTestInputs(block), { ...settings, cracks: '3d' });
    expect(() => planarExpectPrisms(chunks, z, block)).toThrow();
  });

  it('finds the thickness of a turned pane, or runs through a chosen axis', () => {
    const turned = pane.clone();
    const rotation = new THREE.Matrix4().makeRotationY(0.6).multiply(new THREE.Matrix4().makeRotationX(0.3));
    turned.transformVertices(rotation);
    const normal = physicsShatterMidPlane(turned, 'auto').normal;
    expect(Math.abs(normal.dot(z.clone().applyMatrix4(rotation)))).toBeCloseTo(1, 9);
    const settings = physicsShatterTestSettings({ crackSize: 0.25, cracks: '2d' });
    planarExpectPrisms(physicsShatterFracture(physicsShatterTestInputs(turned), settings), normal, turned);
    const x = new THREE.Vector3(1, 0, 0);
    const across = physicsShatterFracture(physicsShatterTestInputs(pane), { ...settings, thicknessAxis: 'x' });
    planarExpectPrisms(across, x, pane);
  });
});

describe('physics shatter radial shards', () => {
  const pane = physicsShatterTestWall(5, 4, 0.01);
  const impact = new THREE.Vector3(0.2, 2.1, -0.005);
  const settings = physicsShatterTestSettings({ mode: 'radial', crackSize: 0.15, impactPoint: impact, seed: 5 });

  it('makes sound prisms around the impact that fill the pane', () => {
    const result = physicsShatterFracture(physicsShatterTestInputs(pane), settings);
    expect(result.pieces.length).toBeGreaterThan(40);
    planarExpectPrisms(result, new THREE.Vector3(0, 0, 1), pane);
    expect(planarVolume(result.pieces)).toBeCloseTo(physicsShatterBrushVolume(pane), 9);
    physicsShatterTestExpectSound(result, 0.15, PHYSICS_SHATTER_MIN_EDGE, 0.01);
  });

  it('makes shards that point away from the impact and grow longer outwards', () => {
    const result = physicsShatterFracture(physicsShatterTestInputs(pane), settings);
    const distance = (piece: PhysicsShatterPiece): number =>
      piece.centroid.clone().setZ(0).distanceTo(impact.clone().setZ(0));
    const outer = result.pieces.filter((piece) => distance(piece) > 0.6 && distance(piece) < 1.8);
    const inner = result.pieces.filter((piece) => distance(piece) > 0.1 && distance(piece) < 0.45);
    const mean = (pieces: PhysicsShatterPiece[], value: (piece: PhysicsShatterPiece) => number): number =>
      pieces.reduce((sum, piece) => sum + value(piece), 0) / Math.max(1, pieces.length);
    expect(outer.length).toBeGreaterThan(5);
    expect(inner.length).toBeGreaterThan(5);
    expect(mean(outer, (piece) => planarAspect(piece, impact))).toBeGreaterThan(1.7);
    expect(mean(outer, (piece) => piece.volume)).toBeGreaterThan(3 * mean(inner, (piece) => piece.volume));
  });

  it('makes the same shards every time and other shards for another seed', () => {
    const inputs = physicsShatterTestInputs(pane);
    const first = physicsShatterFracture(inputs, settings);
    const again = physicsShatterFracture(inputs, settings);
    expect(again.pieces.map((piece) => piece.centroid.toArray())).toEqual(
      first.pieces.map((piece) => piece.centroid.toArray()),
    );
    const other = physicsShatterFracture(inputs, { ...settings, seed: 6 });
    expect(other.pieces.map((piece) => piece.centroid.toArray())).not.toEqual(
      first.pieces.map((piece) => piece.centroid.toArray()),
    );
  });

  it('meets Max Pieces with larger shards', () => {
    const result = physicsShatterFracture(physicsShatterTestInputs(pane), { ...settings, maxPieces: 30 });
    expect(result.limited).toBe(true);
    expect(result.pieces.length).toBeLessThanOrEqual(30);
    expect(planarVolume(result.pieces)).toBeCloseTo(physicsShatterBrushVolume(pane), 9);
  });
});
