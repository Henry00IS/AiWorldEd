import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Grids } from '../src/viewports/grids.js';

describe('Grids facade', () => {
  it('should create a root group for orthographic grids', () => {
    const grids = new Grids(50, 50, 'xz', 'orthographic');
    expect(grids.getScene()).toBeInstanceOf(THREE.Group);
    expect(grids.getScene().children.length).toBeGreaterThan(0);
  });

  it('should create a root group for perspective grids', () => {
    const grids = new Grids(50, 50, 'xz', 'perspective');
    expect(grids.getScene().children.length).toBeGreaterThan(0);
  });

  it('should update orthographic grid from camera without throwing', () => {
    const grids = new Grids(50, 50, 'xy', 'orthographic');
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    expect(() => grids.update(camera)).not.toThrow();
  });

  it('should update perspective grid from camera without throwing', () => {
    const grids = new Grids(50, 50, 'xz', 'perspective');
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(5, 5, 5);
    expect(() => grids.update(camera)).not.toThrow();
  });

  it('should accept snap interval updates', () => {
    const grids = new Grids(50, 50, 'xz', 'orthographic');
    expect(() => grids.setSnapInterval(0.5)).not.toThrow();
  });

  it('should remember plane orientation', () => {
    const grids = new Grids(50, 50, 'yz', 'orthographic');
    expect(grids.getPlane()).toBe('yz');
  });

  it('should dispose without errors', () => {
    const grids = new Grids(50, 50, 'xz', 'perspective');
    expect(() => grids.dispose()).not.toThrow();
  });
});
