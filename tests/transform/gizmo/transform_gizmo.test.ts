import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../../src/theme.js';
import { TransformMode, GizmoAxis } from '../../../src/types/transform_mode.js';
import { TransformGizmo } from '../../../src/transform/gizmo/transform_gizmo.js';
import { getBuiltInCoordinateSpace } from '../../../src/settings/coordinate_space_presets.js';

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

  it('should produce 6 mid-face handles in BOUNDS mode', () => {
    expect(gizmo.getHandles().length).toBe(6);
  });

  it('should produce three axis handles plus free-move center in TRANSLATE mode', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    expect(gizmo.getHandles().length).toBe(4);
    expect(gizmo.getHandles().some((handle) => handle.getAxis() === GizmoAxis.VIEW)).toBe(true);
  });

  it('should resolve reflected profile axes without quaternion reflections', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    gizmo.setCoordinateSpace(getBuiltInCoordinateSpace('unity')!);
    expect(gizmo.axisToWorldVector(GizmoAxis.X).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-7);
    expect(gizmo.axisToWorldVector(GizmoAxis.Y).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-7);
    expect(gizmo.axisToWorldVector(GizmoAxis.Z).distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-7);
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
    gizmo.setActiveHandle(handles[0] ?? null);
    expect(gizmo.getActiveHandle()).toBe(handles[0]);
  });

  it('should clear active handle on setMode', () => {
    const handles = gizmo.getHandles();
    gizmo.setActiveHandle(handles[0] ?? null);
    gizmo.setMode(TransformMode.ROTATE);
    expect(gizmo.getActiveHandle()).toBeNull();
  });

  it('should report active handle correctly via isHandleActive', () => {
    const handles = gizmo.getHandles();
    const firstHandle = handles[0]!;
    expect(gizmo.isHandleActive(firstHandle)).toBe(false);
    gizmo.setActiveHandle(firstHandle);
    expect(gizmo.isHandleActive(firstHandle)).toBe(true);
    if (handles.length > 1) {
      expect(gizmo.isHandleActive(handles[1]!)).toBe(false);
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
    const firstHandle = handles[0]!;
    gizmo.setActiveHandle(firstHandle);
    expect(firstHandle.isHoveredState()).toBe(true);
    if (handles.length > 1) {
      const secondHandle = handles[1]!;
      gizmo.setActiveHandle(secondHandle);
      expect(firstHandle.isHoveredState()).toBe(false);
      expect(secondHandle.isHoveredState()).toBe(true);
    }
  });

  it('should clear active highlight when handle is cleared', () => {
    const handles = gizmo.getHandles();
    const firstHandle = handles[0]!;
    gizmo.setActiveHandle(firstHandle);
    expect(firstHandle.isHoveredState()).toBe(true);
    gizmo.setActiveHandle(null);
    expect(firstHandle.isHoveredState()).toBe(false);
    expect(gizmo.getActiveHandle()).toBeNull();
  });

  it('should rebuild handles correctly when switching modes back and forth', () => {
    gizmo.setMode(TransformMode.ROTATE);
    expect(gizmo.getHandles().length).toBe(3);
    gizmo.setMode(TransformMode.TRANSLATE);
    expect(gizmo.getHandles().length).toBe(4);
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
    gizmo.getHandleGroupClone();
    gizmo.getHandleGroupClone();
    expect(() => gizmo.dispose()).not.toThrow();
    expect(gizmo.getHandles().length).toBe(0);
    expect(gizmo.getActiveHandle()).toBeNull();
  });

  it('should show fixed-length corner guides when bounds drag guides are enabled', () => {
    const clone = gizmo.getHandleGroupClone('xyz');
    const selected = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selected.position.set(0, 2, 0);
    selected.updateMatrixWorld(true);
    gizmo.updateBoundsFromMeshes([selected]);
    gizmo.setBoundsGuideLinesVisible(true);
    const geometry = findGuideGeometry(clone);
    expect(geometry).not.toBeNull();
    expect(countGuideSegments(geometry!)).toBe(24);
  });

  it('hides bounds resize grips on master and clones during body-move suppression only', () => {
    const clone = gizmo.getHandleGroupClone('xyz');
    const selected = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selected.updateMatrixWorld(true);
    gizmo.setVisible(true);
    gizmo.updateBoundsFromMeshes([selected]);
    expect(countVisibleBoundsPickHandles(gizmo.getHandleGroup())).toBe(6);
    expect(countVisibleBoundsPickHandles(clone)).toBe(6);
    gizmo.setBoundsResizeHandlesVisible(false);
    expect(countVisibleBoundsPickHandles(gizmo.getHandleGroup())).toBe(0);
    expect(countVisibleBoundsPickHandles(clone)).toBe(0);
    gizmo.setBoundsResizeHandlesVisible(true);
    expect(countVisibleBoundsPickHandles(gizmo.getHandleGroup())).toBe(6);
    expect(countVisibleBoundsPickHandles(clone)).toBe(6);
  });

  it('does not deep-clone viewport bounds groups when only camera distance changes', () => {
    const clone = gizmo.getHandleGroupClone('xyz');
    gizmo.setVisible(true);
    const selected = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    selected.position.set(0, 1, 0);
    selected.updateMatrixWorld(true);
    const nearCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    nearCamera.position.set(0, 2, 4);
    gizmo.updateBoundsFromMeshes([selected], nearCamera);
    const childAfterFirst = clone.children[0]!;
    const farCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    farCamera.position.set(0, 40, 80);
    gizmo.updateBoundsFromMeshes([selected], farCamera);
    expect(clone.children[0]).toBe(childAfterFirst);
  });

  it('sizes translate handles from orthographic frustum instead of camera distance', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    gizmo.setPivot(new THREE.Vector3(0, 0, 0));
    const camera = new THREE.OrthographicCamera(-2, 2, 1.5, -1.5, 0.1, 1000);
    camera.position.set(0, 100, 0);
    gizmo.updateScaleForCamera(camera);
    const scale = gizmo.getHandleGroup().scale.x;
    expect(scale).toBeCloseTo(3 * 0.08);
    expect(scale).toBeLessThan(100 * 0.08);
  });

  it('scales each viewport clone from its own camera so 3D fly does not inflate 2D', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    gizmo.setVisible(true);
    gizmo.setPivot(new THREE.Vector3(0, 0, 0));
    const orthoClone = gizmo.getHandleGroupClone('xz');
    const perspectiveClone = gizmo.getHandleGroupClone('xyz');
    const ortho = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 1000);
    ortho.position.set(0, 50, 0);
    const perspective = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    perspective.position.set(0, 0, 200);
    gizmo.prepareTransformCloneForCamera(orthoClone, ortho);
    gizmo.prepareTransformCloneForCamera(perspectiveClone, perspective);
    expect(orthoClone.scale.x).toBeCloseTo(6 * 0.08);
    expect(perspectiveClone.scale.x).toBeCloseTo(200 * 0.08);
    expect(orthoClone.scale.x).toBeLessThan(perspectiveClone.scale.x);
    gizmo.updateScaleForCamera(perspective);
    expect(gizmo.getHandleGroup().scale.x).toBeCloseTo(200 * 0.08);
    expect(orthoClone.scale.x).toBeCloseTo(6 * 0.08);
  });

  it('hides Global depth-axis translate handles in orthographic panes', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    gizmo.setHideOrthoDepthAxes(true);
    const top = gizmo.getHandleGroupClone('xz');
    const front = gizmo.getHandleGroupClone('xy');
    const side = gizmo.getHandleGroupClone('yz');
    const perspective = gizmo.getHandleGroupClone('xyz');
    expect(isAxisVisibleOnClone(top, gizmo, GizmoAxis.Y)).toBe(false);
    expect(isAxisVisibleOnClone(top, gizmo, GizmoAxis.X)).toBe(true);
    expect(isAxisVisibleOnClone(front, gizmo, GizmoAxis.Z)).toBe(false);
    expect(isAxisVisibleOnClone(side, gizmo, GizmoAxis.X)).toBe(false);
    expect(isAxisVisibleOnClone(perspective, gizmo, GizmoAxis.Y)).toBe(true);
  });

  it('shows all translate axes in orthographic panes when Local space is active', () => {
    gizmo.setMode(TransformMode.TRANSLATE);
    const top = gizmo.getHandleGroupClone('xz');
    gizmo.setHideOrthoDepthAxes(true);
    expect(isAxisVisibleOnClone(top, gizmo, GizmoAxis.Y)).toBe(false);
    gizmo.setHideOrthoDepthAxes(false);
    expect(isAxisVisibleOnClone(top, gizmo, GizmoAxis.Y)).toBe(true);
    expect(isAxisVisibleOnClone(top, gizmo, GizmoAxis.X)).toBe(true);
  });

  it('hides Global depth-axis scale handles in orthographic panes', () => {
    gizmo.setMode(TransformMode.SCALE);
    gizmo.setHideOrthoDepthAxes(true);
    const top = gizmo.getHandleGroupClone('xz');
    expect(isAxisVisibleOnClone(top, gizmo, GizmoAxis.Y)).toBe(false);
    expect(isAxisVisibleOnClone(top, gizmo, GizmoAxis.Z)).toBe(true);
  });
});

/**
 * Returns whether any mesh for the given axis is visible on a viewport clone.
 *
 * @param clone Viewport gizmo group.
 * @param gizmo Source gizmo with master handles.
 * @param axis Axis to query.
 * @returns True when at least one matching mesh is visible.
 */
function isAxisVisibleOnClone(clone: THREE.Group, gizmo: TransformGizmo, axis: GizmoAxis): boolean {
  const handle = gizmo.getHandles().find((entry) => entry.getAxis() === axis);
  if (!handle) return false;
  const handleId = handle.getHandleId();
  let visible = false;
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.userData['handleId'] !== handleId) return;
    if (child.visible) visible = true;
  });
  return visible;
}

/**
 * Finds the first bounds guide LineSegments geometry under a gizmo group.
 *
 * @param group Viewport or master gizmo group.
 * @returns Shared guide geometry, or null.
 */
function findGuideGeometry(group: THREE.Group): THREE.BufferGeometry | null {
  let found: THREE.BufferGeometry | null = null;
  group.traverse((child) => {
    if (child.userData['isBoundsGuideLines'] !== true) return;
    child.traverse((lineChild) => {
      if (lineChild instanceof THREE.LineSegments && !found) {
        found = lineChild.geometry;
      }
    });
  });
  return found;
}

/**
 * Counts line segments in guide geometry (two vertices per segment).
 *
 * @param geometry Guide BufferGeometry.
 * @returns Segment count.
 */
function countGuideSegments(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position) return 0;
  return Math.floor(position.count / 2);
}

/**
 * Counts visible 3D bounds resize pick roots under a gizmo group.
 *
 * @param group Master or viewport gizmo group.
 * @returns Number of visible pick handles.
 */
function countVisibleBoundsPickHandles(group: THREE.Group): number {
  let count = 0;
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.userData['boundsCubePick'] !== true) return;
    if (child.visible) count += 1;
  });
  return count;
}
