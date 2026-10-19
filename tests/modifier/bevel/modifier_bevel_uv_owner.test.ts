import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT,
  MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import {
  anchorMovesSample,
  curveAnchorMoves,
  curveCenterStays,
  holdsPivot,
  localUpFollowsBrush,
  oddMiddleFollowsFlow,
  parentTurnMatches,
  reverseOwnsUpperWall,
  segmentsRotateTogether,
  singleMatchesSplit,
  tileTurnsTogether,
  singleOwnsLowerWall,
  splitKeepsBothWalls,
} from './modifier_bevel_uv_owner_case.js';
import { neutralPlacement } from './modifier_bevel_uv_owner_expect.js';

describe('bevel curve owner', () => {
  it('reads a volume without owner fields as split and anchor', () => {
    const settings = ModifierVolumeBevel.readSettings(ModifierVolumeBevel.create());
    expect(settings.uvOwner).toBe(MODIFIER_VOLUME_BEVEL_UV_OWNER_SPLIT);
    expect(settings.uvPivot).toBe(MODIFIER_VOLUME_BEVEL_UV_PIVOT_ANCHOR);
    expect(settings.uvSpace).toBe(MODIFIER_VOLUME_BEVEL_UV_SPACE_LOCAL);
  });

  it('gives a 2-segment and a 3-segment curve one parent, and reverse picks the other wall', () => {
    expect(singleOwnsLowerWall(2)).toBe(true);
    expect(singleOwnsLowerWall(3)).toBe(true);
    expect(reverseOwnsUpperWall(2)).toBe(true);
    expect(splitKeepsBothWalls(2)).toBe(true);
    expect(splitKeepsBothWalls(4)).toBe(true);
    expect(splitKeepsBothWalls(8)).toBe(true);
    expect(singleOwnsLowerWall(8)).toBe(true);
    expect(oddMiddleFollowsFlow(3)).toBe(true);
  });

  it('continues the parent texture in single mode, including rotation', () => {
    expect(singleMatchesSplit(0)).toBe(true);
    expect(singleMatchesSplit(35)).toBe(true);
    expect(parentTurnMatches()).toBe(true);
    expect(segmentsRotateTogether()).toBe(true);
    expect(tileTurnsTogether()).toBe(true);
  });

  it('rotates around the requested pivot', () => {
    const matrix = new SurfaceUvMatrix(new THREE.Vector4(1, 0, 0, 0), new THREE.Vector4(0, 1, 0, 0));
    const placement = neutralPlacement(180);
    expect(holdsPivot(matrix, placement, { u: 0.25, v: 0.75 })).toBe(true);
    expect(holdsPivot(matrix, placement, { u: 0.5, v: 0.5 })).toBe(true);
    expect(anchorMovesSample(matrix, placement)).toBe(true);
    expect(curveCenterStays()).toBe(true);
    expect(curveAnchorMoves()).toBe(true);
    expect(localUpFollowsBrush()).toBe(true);
    expect(splitKeepsBothWalls(5)).toBe(true);
    expect(splitKeepsBothWalls(6)).toBe(true);
    expect(oddMiddleFollowsFlow(5)).toBe(true);
  });
});
