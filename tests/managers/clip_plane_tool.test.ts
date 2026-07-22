import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ClipPlaneTool } from '../../src/managers/clip_plane_tool.js';

describe('ClipPlaneTool', () => {
  let tool: ClipPlaneTool;

  beforeEach(() => {
    tool = new ClipPlaneTool();
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

  it('should accept a third point for free orientation', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(1, 0, 0));
    tool.addPoint(new THREE.Vector3(0, 1, 0));
    expect(tool.getPoints().length).toBe(3);
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

  it('should clear points on cancel deactivate', () => {
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    tool.addPoint(new THREE.Vector3(1, 0, 0));
    tool.deactivate();
    expect(tool.isActive()).toBe(false);
    expect(tool.getPoints().length).toBe(0);
    expect(tool.isPlaneReady()).toBe(false);
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
    expect(points[0].y).toBeCloseTo(1);
    expect(tool.isPlaneReady()).toBe(true);
  });

  it('should reject setPoint for invalid indices or inactive tool', () => {
    expect(tool.setPoint(0, new THREE.Vector3(1, 0, 0))).toBe(false);
    tool.activate();
    tool.addPoint(new THREE.Vector3(0, 0, 0));
    expect(tool.setPoint(3, new THREE.Vector3(1, 0, 0))).toBe(false);
  });
});

