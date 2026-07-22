import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ObjectIconFactory } from '../../src/ui/outliner/object_icon_factory.js';

describe('ObjectIconFactory.getIcon', () => {
  it('should return group icon for THREE.Group', () => {
    const group = new THREE.Group();
    const icon = ObjectIconFactory.getIcon(group);
    expect(icon.character).toBe('📁');
    expect(icon.color).toBe('#e67e22');
  });

  it('should return box icon for BoxGeometry mesh', () => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('◼');
    expect(icon.color).toBe('#3498db');
  });

  it('should return sphere icon for SphereGeometry mesh', () => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial()
    );
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('●');
    expect(icon.color).toBe('#2ecc71');
  });

  it('should return plane icon for PlaneGeometry mesh', () => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial()
    );
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('▭');
    expect(icon.color).toBe('#9b59b6');
  });

  it('should return cylinder icon for CylinderGeometry mesh', () => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 8),
      new THREE.MeshBasicMaterial()
    );
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('⬡');
    expect(icon.color).toBe('#1abc9c');
  });

  it('should return generic mesh icon for unknown geometry', () => {
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial()
    );
    const icon = ObjectIconFactory.getIcon(mesh);
    expect(icon.character).toBe('◇');
    expect(icon.color).toBe('#95a5a6');
  });

  it('should return directional light icon', () => {
    const light = new THREE.DirectionalLight(0xffffff);
    const icon = ObjectIconFactory.getIcon(light);
    expect(icon.character).toBe('☀');
    expect(icon.color).toBe('#f39c12');
  });

  it('should return point light icon', () => {
    const light = new THREE.PointLight(0xffffff);
    const icon = ObjectIconFactory.getIcon(light);
    expect(icon.character).toBe('✦');
    expect(icon.color).toBe('#f1c40f');
  });

  it('should return spot light icon', () => {
    const light = new THREE.SpotLight(0xffffff);
    const icon = ObjectIconFactory.getIcon(light);
    expect(icon.character).toBe('◎');
    expect(icon.color).toBe('#e74c3c');
  });

  it('should return camera icon for camera object', () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const icon = ObjectIconFactory.getIcon(camera);
    expect(icon.character).toBe('📷');
    expect(icon.color).toBe('#e74c3c');
  });

  it('should return generic icon for Object3D', () => {
    const obj = new THREE.Object3D();
    const icon = ObjectIconFactory.getIcon(obj);
    expect(icon.character).toBe('○');
    expect(icon.color).toBe('#7f8c8d');
  });

  it('should return ambient light icon for AmbientLight', () => {
    const light = new THREE.AmbientLight(0xffffff);
    const icon = ObjectIconFactory.getIcon(light);
    expect(icon.character).toBe('✧');
    expect(icon.color).toBe('#f1c40f');
  });
});
