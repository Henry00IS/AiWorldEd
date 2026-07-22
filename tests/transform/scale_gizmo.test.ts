import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { GizmoAxis } from '../../src/types/transform_mode.js';
import { ScaleGizmo } from '../../src/transform/scale_gizmo.js';

describe('ScaleGizmo', () => {
  let gizmo: ScaleGizmo;

  beforeEach(() => {
    gizmo = new ScaleGizmo(Theme);
  });

  it('should create 3 handles', () => {
    const handles = gizmo.createHandles();
    expect(handles.length).toBe(3);
  });

  it('should have handles for X, Y, Z axes', () => {
    const handles = gizmo.createHandles();
    const axes = handles.map((h) => h.getAxis());
    expect(axes).toContain(GizmoAxis.X);
    expect(axes).toContain(GizmoAxis.Y);
    expect(axes).toContain(GizmoAxis.Z);
  });

  it('should use correct colors for axis handles', () => {
    const handles = gizmo.createHandles();
    const xHandle = handles.find((h) => h.getAxis() === GizmoAxis.X)!;
    const yHandle = handles.find((h) => h.getAxis() === GizmoAxis.Y)!;
    const zHandle = handles.find((h) => h.getAxis() === GizmoAxis.Z)!;
    expect(xHandle.getColor()).toBe(Theme.gizmoXAxisColor);
    expect(yHandle.getColor()).toBe(Theme.gizmoYAxisColor);
    expect(zHandle.getColor()).toBe(Theme.gizmoZAxisColor);
  });

  it('should have valid visual meshes for all handles', () => {
    const handles = gizmo.createHandles();
    handles.forEach((handle) => {
      const mesh = handle.getVisualMesh();
      expect(mesh).toBeInstanceOf(THREE.Mesh);
    });
  });

  it('should return scene objects for addition', () => {
    gizmo.createHandles();
    const sceneObjects = gizmo.getAllSceneObjects();
    expect(sceneObjects.length).toBe(3);
  });

  it('should dispose without errors', () => {
    gizmo.createHandles();
    expect(() => gizmo.dispose()).not.toThrow();
  });
});
