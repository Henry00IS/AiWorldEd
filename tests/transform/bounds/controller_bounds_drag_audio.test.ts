import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';
import { ControllerBoundsDrag } from '@/transform/bounds/controller_bounds_drag.js';
import { TransformDragSession } from '@/transform/core/session_transform_drag.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { BoundsFace } from '@/types/bounds_face.js';
import type { DataOrientedBounds } from '@/transform/bounds/builder_oriented_bounds.js';
import { resolveMinimumBoundsHalfExtent } from '@/transform/bounds/bounds_resize_math.js';

beforeEach(() => {
  audioSettings.setEnabled(true);
  notificationFrameEvents.reset();
});

afterEach(() => {
  audioSettings.setEnabled(true);
  notificationFrameEvents.reset();
});

describe('ControllerBoundsDrag snap resize audio', () => {
  it('raises scale-channel snap feedback when applied resize changes', () => {
    const { controller, session } = createBoundsDragWithSession(true);
    armResizeSession(session, 1);
    controller.applyResizeDelta([], 1);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(false);
  });

  it('does not raise when snap is disabled', () => {
    const { controller, session } = createBoundsDragWithSession(false);
    armResizeSession(session, 1);
    controller.applyResizeDelta([], 1);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(false);
  });

  it('does not raise again for the same applied resize delta', () => {
    const { controller, session } = createBoundsDragWithSession(true);
    armResizeSession(session, 1);
    controller.applyResizeDelta([], 1);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    notificationFrameEvents.beginFrame();
    controller.applyResizeDelta([], 1);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(false);
  });

  it('raises again when the applied resize delta steps further', () => {
    const { controller, session } = createBoundsDragWithSession(true);
    armResizeSession(session, 1);
    controller.applyResizeDelta([], 1);
    controller.applyResizeDelta([], 2);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
  });

  it('does not BRRR when shrinking past the minimum size clamp', () => {
    const { controller, session } = createBoundsDragWithSession(true);
    const minHalf = resolveMinimumBoundsHalfExtent(true, 1);
    armResizeSession(session, minHalf);
    controller.applyResizeDelta([], -1);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(false);
    notificationFrameEvents.beginFrame();
    controller.applyResizeDelta([], -2);
    controller.applyResizeDelta([], -3);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(false);
  });
});

/**
 * Builds a bounds drag controller and its shared session.
 *
 * @param snapEnabled Whether grid snap is on.
 * @returns Controller and session under test.
 */
function createBoundsDragWithSession(snapEnabled: boolean): {
  controller: ControllerBoundsDrag;
  session: TransformDragSession;
} {
  const session = new TransformDragSession();
  const gizmo = new GizmoTransform(Theme);
  const raycaster = new GizmoRaycaster();
  const executor = new TransformExecutor(new GridSnap(snapEnabled, 1));
  const controller = new ControllerBoundsDrag(session, gizmo, raycaster, executor);
  return { controller, session };
}

/**
 * Arms session fields required for applied-delta resize audio.
 *
 * @param session Drag session.
 * @param halfExtent Start half-extent along the resize face.
 */
function armResizeSession(session: TransformDragSession, halfExtent: number): void {
  session.activeBoundsFace = BoundsFace.POS_X;
  session.startBounds = createStartBounds(halfExtent);
}

/**
 * Builds minimal oriented bounds for resize clamp tests.
 *
 * @param halfExtent Half-extent on all axes.
 * @returns Oriented bounds at the origin.
 */
function createStartBounds(halfExtent: number): DataOrientedBounds {
  return {
    center: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    halfExtents: new THREE.Vector3(halfExtent, halfExtent, halfExtent),
  };
}
