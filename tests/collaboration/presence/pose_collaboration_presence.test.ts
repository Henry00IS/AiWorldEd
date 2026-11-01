import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  POSE_COLLABORATION_PRESENCE_BLEND_MAX_MS,
  PoseCollaborationPresence,
} from '@/collaboration/presence/pose_collaboration_presence.js';

describe('presence pose interpolation', () => {
  it('snaps to the first pose and blends later ones over the gap between updates', () => {
    const pose = new PoseCollaborationPresence();
    pose.target(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), 0);
    expect(pose.update(0)).toBe(false);
    expect(pose.position.x).toBe(0);
    const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    pose.target(new THREE.Vector3(10, 0, 0), turned, 200);
    expect(pose.update(300)).toBe(true);
    expect(pose.position.x).toBeCloseTo(5);
    expect(pose.quaternion.angleTo(turned)).toBeCloseTo(Math.PI / 4);
    expect(pose.update(400)).toBe(false);
    expect(pose.position.x).toBe(10);
  });

  it('blends linearly so consecutive updates move at a steady speed', () => {
    const pose = new PoseCollaborationPresence();
    pose.target(new THREE.Vector3(), new THREE.Quaternion(), 0);
    pose.target(new THREE.Vector3(10, 0, 0), new THREE.Quaternion(), 200);
    pose.update(250);
    expect(pose.position.x).toBeCloseTo(2.5);
    pose.target(new THREE.Vector3(20, 0, 0), new THREE.Quaternion(), 400);
    pose.update(450);
    expect(pose.position.x).toBeCloseTo(12.5);
  });

  it('caps the blend so a late update does not crawl', () => {
    const pose = new PoseCollaborationPresence();
    pose.target(new THREE.Vector3(), new THREE.Quaternion(), 0);
    pose.target(new THREE.Vector3(1, 0, 0), new THREE.Quaternion(), 10000);
    expect(pose.update(10000 + POSE_COLLABORATION_PRESENCE_BLEND_MAX_MS)).toBe(false);
    expect(pose.position.x).toBe(1);
  });

  it('continues from the shown pose when a new target arrives mid-blend', () => {
    const pose = new PoseCollaborationPresence();
    pose.target(new THREE.Vector3(), new THREE.Quaternion(), 0);
    pose.target(new THREE.Vector3(10, 0, 0), new THREE.Quaternion(), 200);
    pose.target(new THREE.Vector3(10, 0, 0), new THREE.Quaternion(), 300);
    expect(pose.position.x).toBeCloseTo(5);
  });
});
