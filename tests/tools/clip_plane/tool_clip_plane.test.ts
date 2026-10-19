import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { ClipPlanePlacementHint } from '@/tools/clip_plane/clip_plane_depth_axis.js';

/**
 * Builds a placement hint for clip tool tests.
 *
 * @param cameraDirection Look direction into the scene.
 * @param surfaceNormal Optional face normal.
 * @param isOrthographic Whether the pick is orthographic.
 * @returns Placement hint.
 */
function makeHint(
  cameraDirection: THREE.Vector3,
  surfaceNormal: THREE.Vector3 | null,
  isOrthographic: boolean,
): ClipPlanePlacementHint {
  return { cameraDirection, surfaceNormal, isOrthographic };
}

describe('ToolClipPlane', () => {
  let tool: ToolClipPlane;

  beforeEach(() => {
    tool = new ToolClipPlane();
  });

  it('should start inactive without a plane', () => {
    expect(tool.isActive()).toBe(false);
    expect(tool.isPlaneReady()).toBe(false);
  });

  it('should become active on activate', () => {
    tool.activate();
    expect(tool.isActive()).toBe(true);
    expect(tool.getPoints().length).toBe(0);
  });

  it('should become plane-ready after two valid points', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(2, 0, 0));
    expect(tool.isPlaneReady()).toBe(true);
    expect(tool.getPlane()).not.toBeNull();
  });

  it('should lock camera depth for orthographic two-point placement', () => {
    tool.activate();
    const orthoHint = makeHint(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), true);
    tool.addPoint(new THREE.Vector3(0, 0, 0), orthoHint);
    tool.addPoint(new THREE.Vector3(2, 0, 0), orthoHint);
    const depth = tool.getDepthAxis();
    expect(depth).not.toBeNull();
    expect(depth!.y).toBeCloseTo(-1);
    const plane = tool.getPlane();
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.normal.dot(new THREE.Vector3(0, -1, 0)))).toBeLessThan(1e-6);
  });

  it('should lock face normal for perspective surface two-point placement', () => {
    tool.activate();
    const faceHint = makeHint(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), false);
    tool.addPoint(new THREE.Vector3(-1, 0, 1), faceHint);
    tool.addPoint(new THREE.Vector3(1, 0, 1), faceHint);
    const depth = tool.getDepthAxis();
    expect(depth).not.toBeNull();
    expect(depth!.z).toBeCloseTo(1);
    const plane = tool.getPlane();
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.normal.dot(new THREE.Vector3(0, 0, 1)))).toBeLessThan(1e-6);
  });

  it('should keep first face depth when the second pick is perspective ground', () => {
    tool.activate();
    const faceHint = makeHint(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), false);
    const groundHint = makeHint(new THREE.Vector3(0, -0.5, -1).normalize(), null, false);
    tool.addPoint(new THREE.Vector3(1, 1, 0), faceHint);
    tool.addPoint(new THREE.Vector3(1, -1, 0), groundHint);
    const depth = tool.getDepthAxis();
    expect(depth).not.toBeNull();
    expect(Math.abs(depth!.x)).toBeCloseTo(1);
  });

  it('should accept a third point for free orientation and clear depth lock', () => {
    tool.activate();
    const faceHint = makeHint(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), false);
    tool.addPoint(new THREE.Vector3(0, 0, 0), faceHint);
    tool.addPoint(new THREE.Vector3(1, 0, 0), faceHint);
    expect(tool.getDepthAxis()).not.toBeNull();
    tool.addPoint(new THREE.Vector3(0, 1, 0));
    expect(tool.getPoints().length).toBe(3);
    expect(tool.getDepthAxis()).toBeNull();
    expect(tool.isPlaneReady()).toBe(true);
    const plane = tool.getPlane();
    expect(Math.abs(plane!.distanceToPoint(new THREE.Vector3(0, 1, 0)))).toBeLessThan(1e-6);
  });

  it('should keep two-point depth axis stable while dragging points', () => {
    tool.activate();
    const faceHint = makeHint(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), false);
    tool.addPoint(new THREE.Vector3(0, 0, 1), faceHint);
    tool.addPoint(new THREE.Vector3(2, 0, 1), faceHint);
    const depthBefore = tool.getDepthAxis();
    tool.setPoint(1, new THREE.Vector3(2, 1, 1));
    const depthAfter = tool.getDepthAxis();
    expect(depthBefore).not.toBeNull();
    expect(depthAfter).not.toBeNull();
    expect(depthAfter!.equals(depthBefore!)).toBe(true);
    expect(tool.isPlaneReady()).toBe(true);
  });

  it('should flip keep side without clearing the plane', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(1, 0, 0));
    expect(tool.getKeepFront()).toBe(true);
    tool.flipKeepSide();
    expect(tool.getKeepFront()).toBe(false);
    expect(tool.isPlaneReady()).toBe(true);
  });

  it('should not notify when deactivate runs on an already inactive tool', () => {
    let notifications = 0;
    tool.setChangeCallback(() => {
      notifications += 1;
    });
    tool.deactivate();
    expect(notifications).toBe(0);
    expect(tool.isActive()).toBe(false);
  });

  it('should notify when an active tool is deactivated', () => {
    let notifications = 0;
    tool.setChangeCallback(() => {
      notifications += 1;
    });
    tool.activate();
    notifications = 0;
    tool.deactivate();
    expect(notifications).toBe(1);
    expect(tool.isActive()).toBe(false);
  });

  it('should clear points on cancel deactivate', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(1, 0, 0));
    tool.deactivate();
    expect(tool.isActive()).toBe(false);
    expect(tool.getPoints().length).toBe(0);
    expect(tool.isPlaneReady()).toBe(false);
    expect(tool.getDepthAxis()).toBeNull();
  });

  it('should ignore points while inactive', () => {
    expect(tool.addPoint(new THREE.Vector3(0, 0, 0))).toBe(false);
  });

  it('should move an existing placement point and rebuild the plane', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(2, 0, 0));
    const moved = tool.setPoint(0, new THREE.Vector3(0, 1, 0));
    expect(moved).toBe(true);
    const points = tool.getPoints();
    expect(points[0]!.y).toBeCloseTo(1);
    expect(tool.isPlaneReady()).toBe(true);
  });

  it('should reject setPoint for invalid indices or inactive tool', () => {
    expect(tool.setPoint(0, new THREE.Vector3(1, 0, 0))).toBe(false);
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    expect(tool.setPoint(3, new THREE.Vector3(1, 0, 0))).toBe(false);
  });
});
