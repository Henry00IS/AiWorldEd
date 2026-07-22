import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { InfiniteGrid3D } from '../../src/viewports/infinite_grid_3d.js';

describe('InfiniteGrid3D', () => {
  let grid: InfiniteGrid3D;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    grid = new InfiniteGrid3D(1);
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 5, 0);
  });

  it('should expose a group object', () => {
    expect(grid.getObject()).toBeInstanceOf(THREE.Group);
  });

  it('should generate line segments on update', () => {
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
  });

  it('should follow the camera by regenerating lines after a large move', () => {
    grid.update(camera);
    const firstCount = grid.getSegmentCount();
    camera.position.set(100, 5, 100);
    grid.update(camera);
    expect(grid.getSegmentCount()).toBe(firstCount);
  });

  it('should accept cell size changes', () => {
    grid.setCellSize(2);
    expect(() => grid.update(camera)).not.toThrow();
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
  });

  it('should dispose without throwing', () => {
    grid.update(camera);
    expect(() => grid.dispose()).not.toThrow();
  });

  it('should not leave a gap in X-lines under the camera patch center', () => {
    camera.position.set(10.3, 5, 20.7);
    grid.update(camera);
    const positions = (
      grid.getObject().children[0] as THREE.LineSegments
    ).geometry.getAttribute('position') as THREE.BufferAttribute;
    const centerX = 10;
    const centerZ = 20;
    let crossesPatchCenter = false;
    for (let i = 0; i < positions.count; i += 2) {
      const ax = positions.getX(i);
      const az = positions.getZ(i);
      const bx = positions.getX(i + 1);
      const bz = positions.getZ(i + 1);
      const isXLine = Math.abs(ax - bx) < 1e-6;
      if (!isXLine) continue;
      if (Math.abs(ax - centerX) > 1e-6) continue;
      const minZ = Math.min(az, bz);
      const maxZ = Math.max(az, bz);
      if (minZ <= centerZ && maxZ >= centerZ) {
        crossesPatchCenter = true;
        break;
      }
    }
    expect(crossesPatchCenter).toBe(true);
  });

  it('should keep a large fixed patch even when snap cell is tiny', () => {
    grid.setCellSize(0.01);
    grid.update(camera);
    expect(grid.getPatchHalfExtent()).toBe(50);
    expect(grid.getSegmentCount()).toBeGreaterThan(100);
  });

  it('should use the snap interval as the minor cell size to match 2D', () => {
    grid.setCellSize(0.25);
    camera.position.set(0.1, 10, 0.1);
    grid.update(camera);
    const positions = (
      grid.getObject().children[0] as THREE.LineSegments
    ).geometry.getAttribute('position') as THREE.BufferAttribute;
    const xLines = new Set<number>();
    for (let i = 0; i < positions.count; i += 2) {
      const ax = positions.getX(i);
      const bx = positions.getX(i + 1);
      if (Math.abs(ax - bx) > 1e-5) continue;
      xLines.add(Math.round(ax * 1000) / 1000);
    }
    const sorted = Array.from(xLines).sort((a, b) => a - b);
    let minStep = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      minStep = Math.min(minStep, sorted[i] - sorted[i - 1]);
    }
    expect(minStep).toBeCloseTo(0.25, 5);
  });

  it('should use brighter major/section lines than minor lines', () => {
    grid.setCellSize(1);
    camera.position.set(0, 10, 0);
    grid.update(camera);
    const colors = (
      grid.getObject().children[0] as THREE.LineSegments
    ).geometry.getAttribute('color') as THREE.BufferAttribute;
    let minLuma = Infinity;
    let maxLuma = -Infinity;
    for (let i = 0; i < colors.count; i++) {
      const luma = colors.getX(i) + colors.getY(i) + colors.getZ(i);
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
    }
    expect(maxLuma).toBeGreaterThan(minLuma + 0.05);
  });

  it('should keep major lines world-locked when the camera moves', () => {
    grid.setCellSize(1);
    camera.position.set(0.4, 10, 0.4);
    grid.update(camera);
    const lumaAtOriginA = sampleXLineLuma(grid, 0);
    const lumaAtOffsetA = sampleXLineLuma(grid, 1);
    camera.position.set(3.6, 10, 2.2);
    grid.update(camera);
    const lumaAtOriginB = sampleXLineLuma(grid, 0);
    const lumaAtOffsetB = sampleXLineLuma(grid, 1);
    // World X=0 is major (multiple of 8); X=1 is minor. Major stays brighter after move.
    expect(lumaAtOriginA).toBeGreaterThan(lumaAtOffsetA);
    expect(lumaAtOriginB).toBeGreaterThan(lumaAtOffsetB);
  });

});

/**
 * Samples average start-vertex luma of X-constant lines at a world X value.
 * @param grid Grid instance after update.
 * @param worldX World X of the line.
 * @returns RGB sum luma, or 0 when not found.
 */
function sampleXLineLuma(grid: InfiniteGrid3D, worldX: number): number {
  const line = grid.getObject().children[0] as THREE.LineSegments;
  const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = line.geometry.getAttribute('color') as THREE.BufferAttribute;
  let total = 0;
  let count = 0;
  for (let i = 0; i < positions.count; i += 2) {
    const ax = positions.getX(i);
    const bx = positions.getX(i + 1);
    if (Math.abs(ax - bx) > 1e-5) continue;
    if (Math.abs(ax - worldX) > 1e-4) continue;
    total += colors.getX(i) + colors.getY(i) + colors.getZ(i);
    count += 1;
  }
  return count === 0 ? 0 : total / count;
}

describe('InfiniteGrid3D fade', () => {
  it('should fade line ends toward the viewport background color', () => {
    const grid = new InfiniteGrid3D(1);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 5, 0);
    grid.update(camera);
    const colors = (
      grid.getObject().children[0] as THREE.LineSegments
    ).geometry.getAttribute('color') as THREE.BufferAttribute;
    const bg = new THREE.Color(0x232323);
    let matchedBackground = false;
    for (let i = 0; i < colors.count; i++) {
      const dr = colors.getX(i) - bg.r;
      const dg = colors.getY(i) - bg.g;
      const db = colors.getZ(i) - bg.b;
      if (Math.hypot(dr, dg, db) < 0.02) {
        matchedBackground = true;
        break;
      }
    }
    expect(matchedBackground).toBe(true);
  });
});
