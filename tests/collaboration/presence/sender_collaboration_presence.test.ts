import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { samplerCollaborationPresence } from '@/collaboration/presence/sampler_collaboration_presence.js';
import { SenderCollaborationPresence } from '@/collaboration/presence/sender_collaboration_presence.js';
import {
  PRESENCE_ENTRIES_MAXIMUM,
  PRESENCE_ID_CHARACTER,
  presenceFrameCheck,
  presenceFrameDecode,
  presenceFrameRelay,
} from '@/collaboration/shared/presence_frame.js';
import { HarnessCollaborationEditor } from '../runtime/harness_collaboration_editor.js';

/**
 * Builds a perspective camera at a position looking down -Z.
 *
 * @param x X position.
 * @param fov Field of view.
 * @returns Camera.
 */
function camera(x: number, fov: number = 50): THREE.PerspectiveCamera {
  const created = new THREE.PerspectiveCamera(fov, 1.5, 0.1, 100);
  created.position.set(x, 2, 3);
  return created;
}

afterEach(() => vi.useRealTimers());

describe('presence sampling', () => {
  it('reads cameras, skips the play camera and adds the character', () => {
    const editor = new HarnessCollaborationEditor('A');
    const play = camera(9);
    editor.cameras.push(camera(1, 40.4), play, camera(3));
    editor.player = { feet: new THREE.Vector3(4, 0, 5), yawRadians: Math.PI / 2, camera: play };
    const entries = samplerCollaborationPresence(editor.host);
    expect(entries.map((entry) => entry.id)).toEqual([0, 2, PRESENCE_ID_CHARACTER]);
    expect(entries[0]?.position).toEqual([1, 2, 3]);
    expect(entries[0]?.fov).toBe(40);
    expect(entries[2]?.fov).toBe(0);
    expect(entries[2]?.quaternion[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it('keeps within the frame limit and leaves out unusable poses', () => {
    const editor = new HarnessCollaborationEditor('A');
    for (let index = 0; index < 8; index++) editor.cameras.push(camera(index));
    editor.cameras.push(camera(Number.NaN));
    expect(samplerCollaborationPresence(editor.host)).toHaveLength(PRESENCE_ENTRIES_MAXIMUM);
    editor.player = { feet: new THREE.Vector3(), yawRadians: 0, camera: null };
    const entries = samplerCollaborationPresence(editor.host);
    expect(entries).toHaveLength(PRESENCE_ENTRIES_MAXIMUM);
    expect(entries.at(-1)?.id).toBe(PRESENCE_ID_CHARACTER);
  });
});

describe('presence sender', () => {
  it('sends 22 byte frames on change only, at most five per second, and retries refused frames', () => {
    vi.useFakeTimers();
    const editor = new HarnessCollaborationEditor('A');
    const view = camera(0);
    editor.cameras.push(view);
    const frames: Uint8Array[] = [];
    let accept = true;
    const link = { sendPresence: (frame: Uint8Array) => accept && frames.push(frame) > 0 };
    const sender = new SenderCollaborationPresence(editor.host, link, () => Date.now());
    sender.start();
    expect(frames).toHaveLength(1);
    expect(frames[0]?.byteLength).toBe(22);
    expect(presenceFrameCheck(frames[0] ?? new Uint8Array())).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(frames).toHaveLength(1);
    for (let step = 0; step < 10; step++) {
      view.position.x += 1;
      vi.advanceTimersByTime(100);
    }
    expect(frames.length).toBeGreaterThanOrEqual(1 + 4);
    expect(frames.length).toBeLessThanOrEqual(1 + 5);
    accept = false;
    view.position.x = 50;
    vi.advanceTimersByTime(400);
    const before = frames.length;
    accept = true;
    vi.advanceTimersByTime(100);
    expect(frames.length).toBe(before + 1);
    const last = presenceFrameDecode(presenceFrameRelay(frames.at(-1) ?? new Uint8Array(), 7));
    expect(last?.entries[0]?.position[0]).toBe(50);
    sender.stop();
    view.position.x = 99;
    vi.advanceTimersByTime(1000);
    expect(frames.length).toBe(before + 1);
  });
});
