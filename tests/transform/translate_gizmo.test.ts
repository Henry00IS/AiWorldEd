import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { GizmoAxis } from '../../src/types/transform_mode.js';
import { TranslateGizmo } from '../../src/transform/translate_gizmo.js';

describe('TranslateGizmo', () => {
  let gizmo: TranslateGizmo;

  beforeEach(() => {
    gizmo = new TranslateGizmo(Theme);
  });

  it('should create 3 axis handles only', () => {
    const handles = gizmo.createHandles();
    expect(handles.length).toBe(3);
  });

  it('should not create plane handles', () => {
    const handles = gizmo.createHandles();
    const planeHandles = handles.filter((h) =>
      h.getAxis() === GizmoAxis.XY_PLANE ||
      h.getAxis() === GizmoAxis.YZ_PLANE ||
      h.getAxis() === GizmoAxis.XZ_PLANE
    );
    expect(planeHandles.length).toBe(0);
  });

  it('should assign correct axis to X handle', () => {
    const handles = gizmo.createHandles();
    const xHandle = handles.find((h) => h.getAxis() === GizmoAxis.X);
    expect(xHandle).toBeDefined();
    expect(xHandle!.getAxis()).toBe(GizmoAxis.X);
  });

  it('should assign correct axis to Y handle', () => {
    const handles = gizmo.createHandles();
    const yHandle = handles.find((h) => h.getAxis() === GizmoAxis.Y);
    expect(yHandle).toBeDefined();
    expect(yHandle!.getAxis()).toBe(GizmoAxis.Y);
  });

  it('should assign correct axis to Z handle', () => {
    const handles = gizmo.createHandles();
    const zHandle = handles.find((h) => h.getAxis() === GizmoAxis.Z);
    expect(zHandle).toBeDefined();
    expect(zHandle!.getAxis()).toBe(GizmoAxis.Z);
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

  it('should have scene objects that can be added to a scene', () => {
    gizmo.createHandles();
    const sceneObjects = gizmo.getAllSceneObjects();
    expect(sceneObjects.length).toBe(3);
  });

  it('should dispose without errors', () => {
    gizmo.createHandles();
    expect(() => gizmo.dispose()).not.toThrow();
  });

  it('should clear handles on new creation', () => {
    const first = gizmo.createHandles();
    const second = gizmo.createHandles();
    expect(second.length).toBe(3);
    expect(second).not.toBe(first);
  });
});
