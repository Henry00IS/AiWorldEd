import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { PrimitiveCreationTool } from '../../src/managers/primitive_creation_tool.js';

describe('PrimitiveCreationTool', () => {
  let scene: THREE.Scene;
  let tool: PrimitiveCreationTool;

  beforeEach(() => {
    scene = new THREE.Scene();
    tool = new PrimitiveCreationTool(scene);
  });

  it('should create without errors', () => {
    expect(tool).toBeDefined();
  });

  it('should start with zero created objects', () => {
    expect(tool.getCreatedObjectCount()).toBe(0);
  });

  it('should start with null last created object', () => {
    expect(tool.getLastCreatedObject()).toBeNull();
  });

  it('should create a box with correct geometry type', () => {
    const mesh = tool.createBox(1, 1, 1);
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
  });

  it('should create a box with correct dimensions', () => {
    const mesh = tool.createBox(2, 3, 4);
    const params = (mesh.geometry as THREE.BoxGeometry).parameters;
    expect(params.width).toBe(2);
    expect(params.height).toBe(3);
    expect(params.depth).toBe(4);
  });

  it('should name box with auto-incremented number', () => {
    const mesh1 = tool.createBox(1, 1, 1);
    const mesh2 = tool.createBox(1, 1, 1);
    expect(mesh1.name).toBe('Cube001');
    expect(mesh2.name).toBe('Cube002');
  });

  it('should create a sphere with correct geometry type', () => {
    const mesh = tool.createSphere(1);
    expect(mesh.geometry).toBeInstanceOf(THREE.SphereGeometry);
  });

  it('should create a sphere with correct radius', () => {
    const mesh = tool.createSphere(2.5);
    const params = (mesh.geometry as THREE.SphereGeometry).parameters;
    expect(params.radius).toBe(2.5);
  });

  it('should name sphere with auto-incremented number', () => {
    const mesh1 = tool.createSphere(1);
    const mesh2 = tool.createSphere(1);
    expect(mesh1.name).toBe('Sphere001');
    expect(mesh2.name).toBe('Sphere002');
  });

  it('should create a cylinder with correct geometry type', () => {
    const mesh = tool.createCylinder(1, 1, 2);
    expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);
  });

  it('should create a cylinder with correct dimensions', () => {
    const mesh = tool.createCylinder(0.5, 1.0, 3);
    const params = (mesh.geometry as THREE.CylinderGeometry).parameters;
    expect(params.radiusTop).toBe(0.5);
    expect(params.radiusBottom).toBe(1.0);
    expect(params.height).toBe(3);
  });

  it('should name cylinder with auto-incremented number', () => {
    const mesh1 = tool.createCylinder(1, 1, 1);
    const mesh2 = tool.createCylinder(1, 1, 1);
    expect(mesh1.name).toBe('Cylinder001');
    expect(mesh2.name).toBe('Cylinder002');
  });

  it('should create a plane with correct geometry type', () => {
    const mesh = tool.createPlane(1, 1);
    expect(mesh.geometry).toBeInstanceOf(THREE.PlaneGeometry);
  });

  it('should rotate plane to be horizontal', () => {
    const mesh = tool.createPlane(1, 1);
    expect(mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
  });

  it('should name plane with auto-incremented number', () => {
    const mesh1 = tool.createPlane(1, 1);
    const mesh2 = tool.createPlane(1, 1);
    expect(mesh1.name).toBe('Plane001');
    expect(mesh2.name).toBe('Plane002');
  });

  it('should use theme box color for materials', () => {
    const mesh = tool.createBox(1, 1, 1);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(Theme.boxColor);
  });

  it('should add edge wireframe to created objects', () => {
    const mesh = tool.createBox(1, 1, 1);
    const lineSegments = mesh.children.find(
      (child) => child instanceof THREE.LineSegments
    );
    expect(lineSegments).toBeDefined();
  });

  it('should leave parenting to the create command stack', () => {
    const mesh = tool.createBox(1, 1, 1);
    expect(mesh.parent).toBeNull();
    expect(scene.children.includes(mesh)).toBe(false);
  });

  it('should track last created object', () => {
    const mesh1 = tool.createBox(1, 1, 1);
    const mesh2 = tool.createSphere(1);
    expect(tool.getLastCreatedObject()).toBe(mesh2);
  });

  it('should correctly count all created objects', () => {
    tool.createBox(1, 1, 1);
    tool.createSphere(1);
    tool.createCylinder(1, 1, 1);
    tool.createPlane(1, 1);
    expect(tool.getCreatedObjectCount()).toBe(4);
  });

  it('should position object when position is provided', () => {
    const pos = new THREE.Vector3(3, 4, 5);
    const mesh = tool.createBox(1, 1, 1, pos);
    expect(mesh.position.x).toBe(3);
    expect(mesh.position.y).toBe(4);
    expect(mesh.position.z).toBe(5);
  });

  it('should use origin position when no position is provided', () => {
    const mesh = tool.createBox(1, 1, 1);
    expect(mesh.position.x).toBe(0);
    expect(mesh.position.y).toBe(0);
    expect(mesh.position.z).toBe(0);
  });

  it('should dispose without errors', () => {
    expect(() => tool.dispose()).not.toThrow();
  });

  it('should reset last created on dispose', () => {
    tool.createBox(1, 1, 1);
    tool.dispose();
    expect(tool.getLastCreatedObject()).toBeNull();
  });
});
