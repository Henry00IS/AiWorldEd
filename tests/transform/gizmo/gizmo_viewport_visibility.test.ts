import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../../src/theme.js';
import { TransformGizmo } from '../../../src/transform/gizmo/transform_gizmo.js';
import { TransformMode } from '../../../src/types/transform_mode.js';
import {
  GIZMO_WANTED_VISIBLE_KEY,
  hideGizmoAfterRenderPass,
  isGizmoWantedVisible,
  setGizmoWantedVisible,
  showGizmoForRenderPass,
} from '../../../src/transform/gizmo/gizmo_viewport_visibility.js';

describe('gizmo viewport multi-view visibility', () => {
  it('keeps clones hidden until a render pass when the tool enables them', () => {
    const gizmo = new TransformGizmo(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(true);
    const top = gizmo.getHandleGroupClone('xz');
    const perspective = gizmo.getHandleGroupClone('xyz');
    expect(isGizmoWantedVisible(top)).toBe(true);
    expect(isGizmoWantedVisible(perspective)).toBe(true);
    expect(top.visible).toBe(false);
    expect(perspective.visible).toBe(false);
    showGizmoForRenderPass(top);
    expect(top.visible).toBe(true);
    expect(perspective.visible).toBe(false);
    hideGizmoAfterRenderPass(top);
    expect(top.visible).toBe(false);
    showGizmoForRenderPass(perspective);
    expect(perspective.visible).toBe(true);
    expect(top.visible).toBe(false);
    gizmo.dispose();
  });

  it('does not enable clones when the tool gizmo is off', () => {
    const gizmo = new TransformGizmo(Theme);
    gizmo.setMode(TransformMode.BOUNDS);
    gizmo.setVisible(false);
    const clone = gizmo.getHandleGroupClone('xy');
    expect(isGizmoWantedVisible(clone)).toBe(false);
    showGizmoForRenderPass(clone);
    expect(clone.visible).toBe(false);
    gizmo.dispose();
  });

  it('falls back to Object3D.visible when wanted flag is unset', () => {
    const group = new THREE.Group();
    // Three.js defaults visible to true; pick helpers that only toggle visible work.
    expect(isGizmoWantedVisible(group)).toBe(true);
    group.visible = false;
    expect(isGizmoWantedVisible(group)).toBe(false);
    group.visible = true;
    expect(isGizmoWantedVisible(group)).toBe(true);
  });

  it('setGizmoWantedVisible clears Object3D.visible for multi-view isolation', () => {
    const group = new THREE.Group();
    group.visible = true;
    setGizmoWantedVisible(group, true);
    expect(group.userData[GIZMO_WANTED_VISIBLE_KEY]).toBe(true);
    expect(group.visible).toBe(false);
  });
});
