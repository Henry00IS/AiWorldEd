import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BUFFER_COLLABORATION_PRESENCE_CAPACITY,
  BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS,
  BufferCollaborationPresence,
  bufferCollaborationPresenceTime,
} from '@/collaboration/presence/buffer_collaboration_presence.js';

describe('presence sample buffer', () => {
  it('moves jittered arrivals half way back toward one send interval apart', () => {
    expect(bufferCollaborationPresenceTime(1000, 1260)).toBeCloseTo(1230);
    expect(bufferCollaborationPresenceTime(1000, 1130)).toBeCloseTo(1165);
  });

  it('uses the arrival time for a late packet (one dropped)', () => {
    expect(bufferCollaborationPresenceTime(1000, 1400)).toBe(1400);
  });

  it('never puts two samples closer than a quarter interval', () => {
    expect(bufferCollaborationPresenceTime(1000, 1000)).toBe(1000 + BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS / 4);
  });

  it('repeats the old pose one interval before a pose that follows a long silence', () => {
    const buffer = new BufferCollaborationPresence();
    buffer.push(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), 0);
    buffer.push(new THREE.Vector3(1, 0, 0), new THREE.Quaternion(), 5000);
    expect(buffer.samples.map((sample) => [sample.time, sample.position.x])).toEqual([
      [0, 0],
      [5000 - BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS, 0],
      [5000, 1],
    ]);
  });

  it('drops the oldest samples beyond its capacity and empties on reset', () => {
    const buffer = new BufferCollaborationPresence();
    for (let index = 0; index < 20; index++)
      buffer.push(new THREE.Vector3(index, 0, 0), new THREE.Quaternion(), index * 200);
    expect(buffer.samples).toHaveLength(BUFFER_COLLABORATION_PRESENCE_CAPACITY);
    expect(buffer.newest()!.position.x).toBe(19);
    buffer.reset(new THREE.Vector3(), new THREE.Quaternion(), 0);
    expect(buffer.samples).toHaveLength(1);
  });
});
