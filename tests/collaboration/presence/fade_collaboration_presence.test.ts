import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FADE_COLLABORATION_PRESENCE_FAR,
  FADE_COLLABORATION_PRESENCE_NEAR,
  fadeCollaborationPresence,
  fadeCollaborationPresenceCamera,
} from '@/collaboration/presence/fade_collaboration_presence.js';

/** Fade of remote gizmos near the viewing camera. */
describe('fade_collaboration_presence', () => {
  it('hides below 0.5 m and shows fully beyond 2 m', () => {
    expect(FADE_COLLABORATION_PRESENCE_NEAR).toBe(0.5);
    expect(FADE_COLLABORATION_PRESENCE_FAR).toBe(2);
    expect(fadeCollaborationPresence(0)).toBe(0);
    expect(fadeCollaborationPresence(0.5)).toBe(0);
    expect(fadeCollaborationPresence(2)).toBe(1);
    expect(fadeCollaborationPresence(50)).toBe(1);
    expect(fadeCollaborationPresence(1.25)).toBeCloseTo(0.5, 6);
  });

  it('rises smoothly and monotonically with flat ends', () => {
    const samples = Array.from({ length: 31 }, (_, index) => fadeCollaborationPresence(0.4 + index * 0.06));
    for (let index = 1; index < samples.length; index++)
      expect(samples[index] ?? 0).toBeGreaterThanOrEqual(samples[index - 1] ?? 0);
    expect(fadeCollaborationPresence(0.51)).toBeLessThan(0.001);
    expect(fadeCollaborationPresence(1.99)).toBeGreaterThan(0.999);
  });

  it('treats invalid distances as hidden', () => {
    expect(fadeCollaborationPresence(Number.NaN)).toBe(0);
    expect(fadeCollaborationPresence(-1)).toBe(0);
  });

  it('measures from the perspective camera and never fades orthographic panes', () => {
    const view = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
    view.position.set(2, 2, 2);
    view.updateMatrixWorld(true);
    expect(fadeCollaborationPresenceCamera(view, new THREE.Vector3(2, 2, 2))).toBe(0);
    expect(fadeCollaborationPresenceCamera(view, new THREE.Vector3(2, 2, 7))).toBe(1);
    const top = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    top.position.set(2, 2, 2);
    top.updateMatrixWorld(true);
    expect(fadeCollaborationPresenceCamera(top, new THREE.Vector3(2, 2, 2))).toBe(1);
  });
});
