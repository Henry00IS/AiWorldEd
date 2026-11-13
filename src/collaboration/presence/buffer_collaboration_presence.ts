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

/** Shortest render delay behind the clock. */
export const BUFFER_COLLABORATION_PRESENCE_DELAY_MIN_MS = 250;
/** Longest render delay behind the clock. */
export const BUFFER_COLLABORATION_PRESENCE_DELAY_MAX_MS = 400;
/** Render delay margin beyond the measured interval and jitter. */
const BUFFER_COLLABORATION_PRESENCE_DELAY_MARGIN_MS = 30;
/** Weight of one arrival in the running interval and jitter averages. */
const BUFFER_COLLABORATION_PRESENCE_MEASURE_WEIGHT = 0.1;

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
  private arrivedAt: number;
  private interval: number;
  private jitter: number;

  /** Creates an empty buffer. */
  constructor() {
    this.samples = [];
    this.arrivedAt = Number.NaN;
    this.interval = BUFFER_COLLABORATION_PRESENCE_INTERVAL_MS;
    this.jitter = 0;
  }

  /**
   * Returns how far behind the clock to render: the measured arrival interval
   * plus one and a half times its jitter and a margin, within bounds.
   *
   * @returns Delay in milliseconds.
   */
  delay(): number {
    const wanted = this.interval + 1.5 * this.jitter + BUFFER_COLLABORATION_PRESENCE_DELAY_MARGIN_MS;
    return THREE.MathUtils.clamp(
      wanted,
      BUFFER_COLLABORATION_PRESENCE_DELAY_MIN_MS,
      BUFFER_COLLABORATION_PRESENCE_DELAY_MAX_MS,
    );
  }

  /**
   * Folds one arrival gap into the running interval and jitter (gaps after a
   * silence are skipped).
   *
   * @param arrival Receive time in milliseconds.
   */
  private measure(arrival: number): void {
    const gap = arrival - this.arrivedAt;
    this.arrivedAt = arrival;
    if (!(gap > 0 && gap <= BUFFER_COLLABORATION_PRESENCE_RESUME_MS)) return;
    const weight = BUFFER_COLLABORATION_PRESENCE_MEASURE_WEIGHT;
    this.jitter += (Math.abs(gap - this.interval) - this.jitter) * weight;
    this.interval += (gap - this.interval) * weight;
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
    this.measure(arrival);
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
