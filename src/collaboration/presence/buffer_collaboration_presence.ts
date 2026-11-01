import * as THREE from 'three';
import { THROTTLE_COLLABORATION_PRESENCE_INTERVAL_MS } from '@/collaboration/presence/throttle_collaboration_presence.js';

/** Send interval of the remote member, the spacing of buffered samples. */
export const BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS = THROTTLE_COLLABORATION_PRESENCE_INTERVAL_MS;
/** Most samples kept per remote item. */
export const BUFFER_COLLABORATION_PRESENCE_CAPACITY = 8;
/** Arrival deviation from the expected time that still counts as jitter. */
export const BUFFER_COLLABORATION_PRESENCE_JITTER_MS = BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS / 2;
/**
 * How much of a jittered arrival moves the sample timeline toward the clock.
 * Half, because a late send timer on the sender (not only the network) also
 * delays arrivals, and then the arrival time matches the pose.
 */
export const BUFFER_COLLABORATION_PRESENCE_DRIFT = 0.5;
/** Smallest timeline spacing between two samples. */
export const BUFFER_COLLABORATION_PRESENCE_SPACING_MIN_MS = BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS / 4;
/** Gap after which the member is treated as having stood still and resumed. */
export const BUFFER_COLLABORATION_PRESENCE_RESUME_MS = BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS * 3;

/** One received pose on the smoothed sample timeline. */
export interface BufferCollaborationPresenceSample {
  readonly time: number;
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

/**
 * Places a received pose on the sample timeline. Arrivals within the jitter
 * window of the expected time (previous sample plus one send interval) stay
 * evenly spaced and drift only part of the way toward the clock, so uneven
 * arrival does not show as uneven speed. Later arrivals (a dropped or late
 * packet) use the arrival time.
 *
 * @param previousTime Timeline time of the newest buffered sample.
 * @param arrival Receive time in milliseconds.
 * @returns Timeline time of the new sample.
 */
export function bufferCollaborationPresenceTime(previousTime: number, arrival: number): number {
  const expected = previousTime + BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS;
  const deviation = arrival - expected;
  const time =
    Math.abs(deviation) <= BUFFER_COLLABORATION_PRESENCE_JITTER_MS
      ? expected + deviation * BUFFER_COLLABORATION_PRESENCE_DRIFT
      : arrival;
  return Math.max(time, previousTime + BUFFER_COLLABORATION_PRESENCE_SPACING_MIN_MS);
}

/**
 * Keeps the newest received poses of one remote item on a smoothed timeline.
 * The sender only sends while something changes, so after a long silence the
 * last pose is repeated one interval before the new one: the member stood still
 * until then and starts moving from there.
 */
export class BufferCollaborationPresence {
  readonly samples: BufferCollaborationPresenceSample[];

  /** Creates an empty buffer. */
  constructor() {
    this.samples = [];
  }

  /**
   * Returns the newest sample.
   *
   * @returns Sample, or undefined when empty.
   */
  newest(): BufferCollaborationPresenceSample | undefined {
    return this.samples[this.samples.length - 1];
  }

  /**
   * Adds a received pose.
   *
   * @param position Position.
   * @param quaternion Orientation.
   * @param arrival Receive time in milliseconds.
   */
  push(position: THREE.Vector3, quaternion: THREE.Quaternion, arrival: number): void {
    const newest = this.newest();
    if (newest === undefined) return this.append(arrival, position, quaternion);
    if (arrival - newest.time > BUFFER_COLLABORATION_PRESENCE_RESUME_MS) {
      this.append(arrival - BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS, newest.position, newest.quaternion);
      return this.append(arrival, position, quaternion);
    }
    this.append(bufferCollaborationPresenceTime(newest.time, arrival), position, quaternion);
  }

  /**
   * Replaces everything with one pose (teleport or first pose).
   *
   * @param position Position.
   * @param quaternion Orientation.
   * @param arrival Receive time in milliseconds.
   */
  reset(position: THREE.Vector3, quaternion: THREE.Quaternion, arrival: number): void {
    this.samples.length = 0;
    this.append(arrival, position, quaternion);
  }

  /**
   * Appends a sample and drops the oldest beyond the capacity.
   *
   * @param time Timeline time.
   * @param position Position (copied).
   * @param quaternion Orientation (copied).
   */
  private append(time: number, position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.samples.push({ time, position: position.clone(), quaternion: quaternion.clone().normalize() });
    if (this.samples.length > BUFFER_COLLABORATION_PRESENCE_CAPACITY) this.samples.shift();
  }
}
