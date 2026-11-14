import { describe, expect, it } from 'vitest';
import {
  PLAYER_TOY_POSE_PLACE_RELEASE,
  PLAYER_TOY_POSE_REST,
  PLAYER_TOY_POSE_SECONDS,
  PLAYER_TOY_POSE_THROW_RELEASE,
  playerToyPoseAt,
} from '@/player/toy/player_toy_viewmodel_pose.js';

describe('first-person throw poses', () => {
  it('rests outside the animation and winds back with a bent elbow before swinging out to the release', () => {
    expect(playerToyPoseAt(-1, false)).toEqual(PLAYER_TOY_POSE_REST);
    expect(playerToyPoseAt(Number.NaN, false)).toEqual(PLAYER_TOY_POSE_REST);
    expect(playerToyPoseAt(PLAYER_TOY_POSE_SECONDS, true)).toEqual(PLAYER_TOY_POSE_REST);
    const windup = playerToyPoseAt(0.12, false);
    const release = playerToyPoseAt(PLAYER_TOY_POSE_THROW_RELEASE, false);
    const follow = playerToyPoseAt(0.34, false);
    expect(windup.elbow).toBeGreaterThan(PLAYER_TOY_POSE_REST.elbow);
    expect(release.elbow).toBeLessThan(windup.elbow);
    expect(release.pitch).toBeGreaterThan(windup.pitch);
    expect(follow.pitch).toBeLessThan(release.pitch);
    expect(playerToyPoseAt(PLAYER_TOY_POSE_SECONDS - 1e-6, false).pitch).toBeCloseTo(PLAYER_TOY_POSE_REST.pitch, 5);
  });

  it('eases continuously between keys and reaches down for a put-down', () => {
    for (let t = 0.001; t < PLAYER_TOY_POSE_SECONDS; t += 0.005) {
      const a = playerToyPoseAt(t, false);
      const b = playerToyPoseAt(t + 0.001, false);
      expect(Math.abs(a.pitch - b.pitch) + Math.abs(a.elbow - b.elbow)).toBeLessThan(0.05);
    }
    expect(playerToyPoseAt(PLAYER_TOY_POSE_PLACE_RELEASE, true).pitch).toBeLessThan(PLAYER_TOY_POSE_REST.pitch);
  });
});
