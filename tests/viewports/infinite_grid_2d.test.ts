import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { InfiniteGrid2D } from '../../src/viewports/infinite_grid_2d.js';

describe('InfiniteGrid2D', () => {
  let camera: THREE.OrthographicCamera;

  beforeEach(() => {
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
  });

  it('should generate lines for the xy plane', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
  });

  it('should generate lines for xz and yz planes', () => {
    const top = new InfiniteGrid2D('xz', 0.25);
    const side = new InfiniteGrid2D('yz', 0.25);
    camera.position.set(0, 50, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    top.update(camera);
    camera.position.set(50, 0, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    side.update(camera);
    expect(top.getSegmentCount()).toBeGreaterThan(0);
    expect(side.getSegmentCount()).toBeGreaterThan(0);
  });

  it('should coarsen cells when zoomed far out without exploding line count', () => {
    const grid = new InfiniteGrid2D('xy', 0.125);
    camera.left = -200;
    camera.right = 200;
    camera.top = 200;
    camera.bottom = -200;
    camera.updateProjectionMatrix();
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
    expect(grid.getSegmentCount()).toBeLessThan(20000);
  });

  it('should keep drawing lines when zooming out across LOD boundaries', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    const counts: number[] = [];
    for (const size of [8, 16, 32, 64, 128]) {
      camera.left = -size;
      camera.right = size;
      camera.top = size;
      camera.bottom = -size;
      camera.updateProjectionMatrix();
      grid.update(camera);
      counts.push(grid.getSegmentCount());
    }
    counts.forEach((count) => expect(count).toBeGreaterThan(0));
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });

  it('should use brighter colors for section and major lines than minor lines', () => {
    const grid = new InfiniteGrid2D('xy', 1);
    camera.left = -20;
    camera.right = 20;
    camera.top = 20;
    camera.bottom = -20;
    camera.updateProjectionMatrix();
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

  it('should accept snap interval updates', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    grid.setSnapInterval(1);
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
  });

  it('should dispose without throwing', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    grid.update(camera);
    expect(() => grid.dispose()).not.toThrow();
  });
});
