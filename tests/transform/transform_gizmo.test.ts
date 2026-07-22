import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { TransformMode, GizmoAxis } from '../../src/types/transform_mode.js';
import { TransformGizmo } from '../../src/transform/transform_gizmo.js';

describe('TransformGizmo', () => {
  let gizmo: TransformGizmo;

  beforeEach(() => {
    gizmo = new TransformGizmo(Theme);
  });

  afterEach(() => {
    gizmo.dispose();
  });

  it('should start in BOUNDS mode', () => {
    expect(gizmo.getMode()).toBe(TransformMode.BOUNDS);
  });

  it('should start hidden until a selection is made', () => {
    expect(gizmo.getHandleGroup().visible).toBe(false);
  });

  it('should switch to ROTATE mode', () => {
    gizmo.setMode(TransformMode.ROTATE);
    expect(gizmo.getMode()).toBe(TransformMode.ROTATE);
  });

  it('should switch to SCALE mode', () => {
    gizmo.setMode(TransformMode.SCALE);
    expect(gizmo.getMode()).toBe(TransformMode.SCALE);
  });

  it('should produce 6 handles in BOUNDS mode', () => {
    expect(gizmo.getHandles().length).toBe(6);
  });

  it('should produce 3 axis handles in TRANSLATE mode', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    expect(gizmo.getHandles().length).toBe(3);
  });

  it('should produce 3 handles in ROTATE mode', () => {
    gizmo.setMode(TransformMode.ROTATE);
    expect(gizmo.getHandles().length).toBe(3);
  });

  it('should produce 3 handles in SCALE mode', () => {
    gizmo.setMode(TransformMode.SCALE);
    expect(gizmo.getHandles().length).toBe(3);
  });

  it('should return a valid handle group', () => {
    const group = gizmo.getHandleGroup();
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe('transform_gizmo');
  });

  it('should have children in handle group after construction', () => {
    const group = gizmo.getHandleGroup();
    expect(group.children.length).toBeGreaterThan(0);
  });

  it('should start with no active handle', () => {
    expect(gizmo.getActiveHandle()).toBeNull();
  });

  it('should set active handle correctly', () => {
    const handles = gizmo.getHandles();
    gizmo.setActiveHandle(handles[0]);
    expect(gizmo.getActiveHandle()).toBe(handles[0]);
  });

  it('should clear active handle on setMode', () => {
    const handles = gizmo.getHandles();
    gizmo.setActiveHandle(handles[0]);
    gizmo.setMode(TransformMode.ROTATE);
    expect(gizmo.getActiveHandle()).toBeNull();
  });

  it('should report active handle correctly via isHandleActive', () => {
    const handles = gizmo.getHandles();
    expect(gizmo.isHandleActive(handles[0])).toBe(false);
    gizmo.setActiveHandle(handles[0]);
    expect(gizmo.isHandleActive(handles[0])).toBe(true);
    if (handles.length > 1) {
      expect(gizmo.isHandleActive(handles[1])).toBe(false);
    }
  });

  it('should update pivot position correctly', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    const pivot = new THREE.Vector3(5, 10, 15);
    gizmo.setPivot(pivot);
    const group = gizmo.getHandleGroup();
    expect(group.position.x).toBe(5);
    expect(group.position.y).toBe(10);
    expect(group.position.z).toBe(15);
  });

  it('should clear active highlight when setting new handle', () => {
    const handles = gizmo.getHandles();
    gizmo.setActiveHandle(handles[0]);
    expect(handles[0].isHoveredState()).toBe(true);
    if (handles.length > 1) {
      gizmo.setActiveHandle(handles[1]);
      expect(handles[0].isHoveredState()).toBe(false);
      expect(handles[1].isHoveredState()).toBe(true);
    }
  });

  it('should clear active highlight when handle is cleared', () => {
    const handles = gizmo.getHandles();
    gizmo.setActiveHandle(handles[0]);
    expect(handles[0].isHoveredState()).toBe(true);
    gizmo.setActiveHandle(null);
    expect(handles[0].isHoveredState()).toBe(false);
    expect(gizmo.getActiveHandle()).toBeNull();
  });

  it('should rebuild handles correctly when switching modes back and forth', () => {
    gizmo.setMode(TransformMode.ROTATE);
    expect(gizmo.getHandles().length).toBe(3);
    gizmo.setMode(TransformMode.TRANSLATE);
    expect(gizmo.getHandles().length).toBe(3);
    gizmo.setMode(TransformMode.SCALE);
    expect(gizmo.getHandles().length).toBe(3);
  });

  it('should have valid handle axes for current mode', () => {
    const handles = gizmo.getHandles();
    const axes = handles.map((h) => h.getAxis());
    expect(axes).toContain(GizmoAxis.X);
    expect(axes).toContain(GizmoAxis.Y);
    expect(axes).toContain(GizmoAxis.Z);
  });

  it('should dispose without errors', () => {
    gizmo.dispose();
    expect(gizmo.getHandles().length).toBe(0);
    expect(gizmo.getActiveHandle()).toBeNull();
  });

  it('should produce independent clones via getHandleGroupClone', () => {
    const cloneA = gizmo.getHandleGroupClone();
    const cloneB = gizmo.getHandleGroupClone();
    expect(cloneA).not.toBe(cloneB);
    expect(cloneA).not.toBe(gizmo.getHandleGroup());
  });

  it('should produce clones with same child count as master group', () => {
    const master = gizmo.getHandleGroup();
    const clone = gizmo.getHandleGroupClone();
    expect(clone.children.length).toBe(master.children.length);
  });

  it('should produce clones that are independent from master group', () => {
    const clone = gizmo.getHandleGroupClone();
    const master = gizmo.getHandleGroup();
    if (master.children.length > 0 && clone.children.length > 0) {
      expect(clone.children[0]).not.toBe(master.children[0]);
    }
  });

  it('should propagate pivot updates to all viewport group clones', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    const cloneA = gizmo.getHandleGroupClone();
    const cloneB = gizmo.getHandleGroupClone();
    const pivot = new THREE.Vector3(10, 20, 30);
    gizmo.setPivot(pivot);
    const master = gizmo.getHandleGroup();
    expect(master.position.x).toBe(10);
    expect(cloneA.position.x).toBe(10);
    expect(cloneB.position.x).toBe(10);
  });

  it('should rebuild all viewport group clones when mode changes', () => {
    const cloneA = gizmo.getHandleGroupClone();
    const cloneB = gizmo.getHandleGroupClone();
    expect(cloneA.children.length).toBeGreaterThan(0);
    gizmo.setMode(TransformMode.ROTATE);
    expect(cloneA.children.length).toBeGreaterThan(0);
    expect(cloneB.children.length).toBeGreaterThan(0);
  });

  it('should update viewport group clone child counts on mode switch', () => {
    const clone = gizmo.getHandleGroupClone();
    const translateChildCount = clone.children.length;
    gizmo.setMode(TransformMode.ROTATE);
    const rotateChildCount = clone.children.length;
    expect(translateChildCount).toBeGreaterThan(0);
    expect(rotateChildCount).toBeGreaterThan(0);
  });

  it('should dispose all viewport group clones without errors', () => {
    const cloneA = gizmo.getHandleGroupClone();
    const cloneB = gizmo.getHandleGroupClone();
    expect(() => gizmo.dispose()).not.toThrow();
    expect(gizmo.getHandles().length).toBe(0);
    expect(gizmo.getActiveHandle()).toBeNull();
  });
});
