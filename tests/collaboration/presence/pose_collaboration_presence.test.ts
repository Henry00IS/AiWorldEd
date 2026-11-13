import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  POSE_COLLABORATION_PRESENCE_DELAY_MS,
  POSE_COLLABORATION_PRESENCE_TELEPORT_METERS,
  PoseCollaborationPresence,
} from '@/collaboration/presence/pose_collaboration_presence.js';
import { INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS } from '@/collaboration/presence/interpolation_collaboration_presence.js';

/** Frame length of the simulated 60 Hz render loop. */
const FRAME_MS = 1000 / 60;
/** Send interval of the simulated sender. */
const SEND_MS = 200;
/** Walking speed of the simulated sender, metres per millisecond. */
const SPEED = 0.004;

/**
 * Simulates a sender walking along +X at a steady speed and a receiver
 * rendering at 60 Hz; returns the shown x per frame.
 *
 * @param arrival Maps a send time to its receive time, or null to drop it.
 * @param durationMs Simulated time.
 * @returns Shown x per frame plus the pose.
 */
function simulate(
  arrival: (sent: number) => number | null,
  durationMs: number,
): { xs: number[]; pose: PoseCollaborationPresence } {
  const pose = new PoseCollaborationPresence();
  const packets: { at: number; x: number }[] = [];
  for (let sent = 0; sent <= durationMs; sent += SEND_MS) {
    const at = arrival(sent);
    if (at !== null) packets.push({ at, x: sent * SPEED });
  }
  packets.sort((a, b) => a.at - b.at);
  const xs: number[] = [];
  for (let now = 0; now <= durationMs; now += FRAME_MS) {
    while (packets.length > 0 && packets[0]!.at <= now)
      pose.target(new THREE.Vector3(packets.shift()!.x, 0, 0), new THREE.Quaternion(), now);
    pose.update(now);
    xs.push(pose.position.x);
  }
  return { xs, pose };
}

/**
 * Simulates a sender whose timer fires at uneven times: each pose is sampled
 * when it is sent and arrives 50 ms later.
 *
 * @param sentAt Send time of the n-th packet.
 * @param durationMs Simulated duration.
 * @returns Shown x per frame.
 */
function simulateSent(sentAt: (index: number) => number, durationMs: number): number[] {
  const pose = new PoseCollaborationPresence();
  const xs: number[] = [];
  let index = 0;
  for (let now = 0; now <= durationMs; now += FRAME_MS) {
    while (sentAt(index) + 50 <= now) {
      pose.target(new THREE.Vector3(sentAt(index) * SPEED, 0, 0), new THREE.Quaternion(), now);
      index++;
    }
    pose.update(now);
    xs.push(pose.position.x);
  }
  return xs;
}

/**
 * Per-frame steps of the shown x after the warm-up (first two intervals).
 *
 * @param xs Shown x per frame.
 * @returns Steps.
 */
function steps(xs: readonly number[]): number[] {
  const start = Math.ceil((SEND_MS * 2 + POSE_COLLABORATION_PRESENCE_DELAY_MS) / FRAME_MS);
  return xs
    .slice(start)
    .map((x, index, list) => (index === 0 ? Number.NaN : x - list[index - 1]!))
    .slice(1);
}

describe('presence pose interpolation', () => {
  it('moves at a steady speed with no steps for a steady stream', () => {
    const moving = steps(simulate((sent) => sent, 3000).xs).slice(0, -30);
    const expected = SPEED * FRAME_MS;
    moving.forEach((step) => expect(Math.abs(step - expected)).toBeLessThan(expected * 0.05));
  });

  it('renders about one interval behind the newest pose', () => {
    const { xs } = simulate((sent) => sent, 2000);
    const shownAt = Math.floor(2000 / FRAME_MS) * FRAME_MS;
    expect(Math.abs(xs[xs.length - 1]! - (shownAt - POSE_COLLABORATION_PRESENCE_DELAY_MS) * SPEED)).toBeLessThan(
      FRAME_MS * SPEED * 1.5,
    );
  });

  it('extrapolates through a dropped packet for at most 100 ms, then pauses briefly, never stepping back or jumping', () => {
    const moving = steps(simulate((sent) => (sent === 1000 ? null : sent), 3000).xs).slice(0, -30);
    const expected = SPEED * FRAME_MS;
    const paused = moving.filter((step) => step < expected * 0.5).length;
    expect(paused).toBeLessThanOrEqual(Math.ceil(100 / FRAME_MS));
    moving.forEach((step) => {
      expect(step).toBeGreaterThanOrEqual(0);
      expect(step).toBeLessThan(expected * 1.6);
    });
  });

  it('keeps an even speed when the network delivers packets unevenly', () => {
    const jitter = [0, 40, -25, 45, 10, -40, 30, -10];
    const moving = steps(simulate((sent) => sent + 100 + jitter[(sent / SEND_MS) % jitter.length]!, 4000).xs).slice(
      0,
      -30,
    );
    const expected = SPEED * FRAME_MS;
    moving.forEach((step) => {
      expect(step).toBeGreaterThan(expected * 0.6);
      expect(step).toBeLessThan(expected * 1.4);
    });
  });

  it('keeps an even speed when the sender timer fires unevenly', () => {
    const late = [0, 40, 10, 50, 0, 30, 50, 20];
    const xs = simulateSent((index) => index * SEND_MS + late[index % late.length]!, 4000);
    const expected = SPEED * FRAME_MS;
    steps(xs)
      .slice(0, -30)
      .forEach((step) => {
        expect(step).toBeGreaterThan(expected * 0.6);
        expect(step).toBeLessThan(expected * 1.4);
      });
  });

  it('snaps on a teleport instead of sliding across the world', () => {
    const pose = new PoseCollaborationPresence();
    pose.target(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), 0);
    pose.target(new THREE.Vector3(1, 0, 0), new THREE.Quaternion(), 200);
    const far = POSE_COLLABORATION_PRESENCE_TELEPORT_METERS + 20;
    pose.target(new THREE.Vector3(far, 0, 0), new THREE.Quaternion(), 400);
    expect(pose.position.x).toBe(far);
    expect(pose.update(400 + FRAME_MS)).toBe(false);
    expect(pose.position.x).toBe(far);
  });

  it('snaps to the first pose and on an explicit snap (play mode enter or exit)', () => {
    const pose = new PoseCollaborationPresence();
    pose.target(new THREE.Vector3(3, 0, 0), new THREE.Quaternion(), 0);
    expect(pose.position.x).toBe(3);
    expect(pose.update(FRAME_MS)).toBe(false);
    pose.snap(new THREE.Vector3(4, 0, 0), new THREE.Quaternion(), 50);
    expect(pose.position.x).toBe(4);
  });

  it('extrapolates for a capped time, then holds and settles on the last pose so the loop can stop', () => {
    const pose = new PoseCollaborationPresence();
    [0, 200, 400].forEach((t) => pose.target(new THREE.Vector3(t * SPEED, 0, 0), new THREE.Quaternion(), t));
    const newestShown = 400 + POSE_COLLABORATION_PRESENCE_DELAY_MS;
    pose.update(newestShown + INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS);
    const capped = pose.position.x;
    expect(capped).toBeCloseTo((400 + INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS) * SPEED, 3);
    pose.update(newestShown + INTERPOLATION_COLLABORATION_PRESENCE_EXTRAPOLATE_MS + 150);
    expect(pose.position.x).toBeCloseTo(capped, 5);
    expect(pose.update(newestShown + 2000)).toBe(false);
    expect(pose.position.x).toBeCloseTo(400 * SPEED, 5);
  });

  it('slerps rotation between samples along the shortest arc, also across half a turn', () => {
    const pose = new PoseCollaborationPresence();
    const up = new THREE.Vector3(0, 1, 0);
    const from = new THREE.Quaternion().setFromAxisAngle(up, Math.PI - 0.3);
    const to = new THREE.Quaternion().setFromAxisAngle(up, -Math.PI + 0.3);
    pose.target(new THREE.Vector3(), from, 0);
    pose.target(new THREE.Vector3(), to, 200);
    for (let now = 0; now <= 1000; now += FRAME_MS) {
      pose.update(now);
      expect(pose.quaternion.angleTo(from) + pose.quaternion.angleTo(to)).toBeCloseTo(0.6, 4);
    }
    expect(pose.quaternion.angleTo(to)).toBeLessThan(1e-6);
  });

  it('blends a late correction in over time instead of snapping', () => {
    const pose = new PoseCollaborationPresence();
    [0, 200, 400].forEach((t) => pose.target(new THREE.Vector3(t * SPEED, 0, 0), new THREE.Quaternion(), t));
    const lost = 400 + POSE_COLLABORATION_PRESENCE_DELAY_MS + 200;
    pose.update(lost);
    const before = pose.position.x;
    pose.target(new THREE.Vector3(0.6, 0, 0), new THREE.Quaternion(), lost);
    expect(pose.position.x).toBeCloseTo(before, 6);
    const jump = Math.abs(before - 0.6);
    pose.update(lost + FRAME_MS);
    expect(Math.abs(pose.position.x - before)).toBeLessThan(jump * 0.2);
    pose.update(lost + 3000);
    expect(pose.position.x).toBeCloseTo(0.6, 4);
  });

  it('never overshoots when the member stops walking and the sender confirms the resting pose', () => {
    const pose = new PoseCollaborationPresence();
    const stop = 1000 * SPEED + 0.1;
    for (let t = 0; t <= 1000; t += SEND_MS) pose.target(new THREE.Vector3(t * SPEED, 0, 0), new THREE.Quaternion(), t);
    pose.target(new THREE.Vector3(stop, 0, 0), new THREE.Quaternion(), 1200);
    let highest = 0;
    for (let now = 1200; now < 3000; now += FRAME_MS) {
      if (now >= 1400 && now < 1400 + FRAME_MS) pose.target(new THREE.Vector3(stop, 0, 0), new THREE.Quaternion(), now);
      pose.update(now);
      highest = Math.max(highest, pose.position.x);
    }
    expect(highest).toBeLessThanOrEqual(stop + 1e-9);
    expect(pose.position.x).toBe(stop);
  });

  it('never turns past the final facing when a fast turn stops, and never turns back', () => {
    const pose = new PoseCollaborationPresence();
    const up = new THREE.Vector3(0, 1, 0);
    const yawAt = (t: number): number => Math.min(t, 1000) * 0.006;
    const final = new THREE.Quaternion().setFromAxisAngle(up, yawAt(1000));
    let previous = Number.POSITIVE_INFINITY;
    let sent = -SEND_MS;
    for (let now = 0; now < 3000; now += FRAME_MS) {
      if (now >= sent + SEND_MS && sent < 1400)
        pose.target(new THREE.Vector3(), new THREE.Quaternion().setFromAxisAngle(up, yawAt((sent += SEND_MS))), now);
      pose.update(now);
      const remaining = pose.quaternion.angleTo(final);
      if (now > 1000) expect(remaining).toBeLessThanOrEqual(previous + 1e-6);
      previous = remaining;
    }
    expect(previous).toBeLessThan(1e-6);
  });

  it('follows a curved camera fly path smoothly, without overshooting its stop', () => {
    const pose = new PoseCollaborationPresence();
    const pathAt = (t: number): THREE.Vector3 => {
      const s = Math.min(t, 2000) / 1000;
      return new THREE.Vector3(10 * s, 2 * Math.sin(2 * s), 1.5 * s * s);
    };
    const end = pathAt(2000);
    const heading = end.clone().sub(pathAt(1950)).normalize();
    const shown: THREE.Vector3[] = [];
    let sent = -SEND_MS;
    for (let now = 0; now < 4000; now += FRAME_MS) {
      if (now >= sent + SEND_MS && sent < 2200) pose.target(pathAt((sent += SEND_MS)), new THREE.Quaternion(), now);
      pose.update(now);
      shown.push(pose.position.clone());
      expect(pose.position.clone().sub(end).dot(heading)).toBeLessThanOrEqual(1e-6);
    }
    const speeds = shown
      .slice(40, 120)
      .map((point, index, list) => (index === 0 ? 0 : point.distanceTo(list[index - 1]!)));
    const changes = speeds.slice(2).map((speed, index) => Math.abs(speed - speeds[index + 1]!));
    expect(Math.max(...changes)).toBeLessThan(0.02);
    expect(shown.at(-1)?.distanceTo(end)).toBe(0);
  });
});
