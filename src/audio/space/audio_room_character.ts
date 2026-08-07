/** Reverb / room character applied to the soft reverb bus. */
export interface AudioRoomCharacter {
  /** Dry path gain (0–1). */
  dryGain: number;
  /** Wet path gain (0–1). */
  wetGain: number;
  /** Feedback amount for the soft tail (0–1, keep below ~0.7). */
  tailFeedback: number;
  /** Multiplier for early-reflection delay times. */
  earlyDelayScale: number;
  /** Multiplier for the recirculating tail delay time. */
  tailDelayScale: number;
  /** Multiplier for early-reflection tap gains. */
  earlyGainScale: number;
  /** Wet lowpass cutoff in Hz. */
  wetLowpassHz: number;
}

/** Free-space totals along world X, Y, and Z (sum of opposite rays). */
export interface AudioRoomAxisTotals {
  /** Free distance along +X plus free distance along −X. */
  totalX: number;
  /** Free distance along +Y plus free distance along −Y. */
  totalY: number;
  /** Free distance along +Z plus free distance along −Z. */
  totalZ: number;
}

/**
 * Estimated room acoustics from six axis rays (Steam Audio–style size model).
 * Mean free path mfp = 4V/S drives wetness and delay scales continuously.
 */
export interface AudioRoomAcoustics {
  /** Axis free lengths (opposite rays summed). */
  totals: AudioRoomAxisTotals;
  /** Approximate volume Lx·Ly·Lz. */
  volume: number;
  /** Approximate surface 2(LxLy + LyLz + LzLx). */
  surfaceArea: number;
  /** Classic mean free path 4V/S (world units). */
  meanFreePath: number;
  /** LongAxis / shortMean — high values are corridors. */
  anisotropy: number;
  /** Mean of the two shorter axis totals. */
  shortMean: number;
  /** Longest axis total. */
  longTotal: number;
  /** Sabine-style RT60 estimate in seconds (game units as metres, α fixed). */
  estimatedRt60Seconds: number;
}

/** Outdoor / no solid geometry — light open-air wash (rare in closed CSG maps). */
export const AUDIO_ROOM_CHARACTER_VOID: Readonly<AudioRoomCharacter> = Object.freeze({
  dryGain: 0.94,
  wetGain: 0.06,
  tailFeedback: 0.22,
  earlyDelayScale: 0.7,
  tailDelayScale: 0.9,
  earlyGainScale: 0.7,
  wetLowpassHz: 2200,
});

/** Fully dry mix for 2D orthographic viewports (no room reverb, mono only). */
export const AUDIO_ROOM_CHARACTER_DRY_2D: Readonly<AudioRoomCharacter> = Object.freeze({
  dryGain: 1,
  wetGain: 0,
  tailFeedback: 0,
  earlyDelayScale: 0.5,
  tailDelayScale: 0.5,
  earlyGainScale: 0,
  wetLowpassHz: 2400,
});

/**
 * Landmark character for a compact enclosed room (continuous solver may
 * differ). Kept for defaults and tests that need a named medium baseline.
 */
export const AUDIO_ROOM_CHARACTER_SMALL: Readonly<AudioRoomCharacter> = Object.freeze({
  dryGain: 0.92,
  wetGain: 0.1,
  tailFeedback: 0.24,
  earlyDelayScale: 0.75,
  tailDelayScale: 0.8,
  earlyGainScale: 0.9,
  wetLowpassHz: 1900,
});

/** Default medium interior before the first probe. */
export const AUDIO_ROOM_CHARACTER_MEDIUM: Readonly<AudioRoomCharacter> = Object.freeze({
  dryGain: 0.9,
  wetGain: 0.14,
  tailFeedback: 0.28,
  earlyDelayScale: 1,
  tailDelayScale: 1,
  earlyGainScale: 0.95,
  wetLowpassHz: 2100,
});

/** Large open solid enclosure landmark. */
export const AUDIO_ROOM_CHARACTER_OPEN: Readonly<AudioRoomCharacter> = Object.freeze({
  dryGain: 0.88,
  wetGain: 0.18,
  tailFeedback: 0.32,
  earlyDelayScale: 1.15,
  tailDelayScale: 1.25,
  earlyGainScale: 1,
  wetLowpassHz: 2400,
});

/**
 * Both rays miss on an axis: use this free length. CSG maps are closed, so a
 * double miss means “beyond probe range”, not outdoor void.
 */
const BOTH_RAYS_MISSED_AXIS_LENGTH = 24;

/** Minimum axis length so volume/surface stay stable. */
const MIN_AXIS_LENGTH = 0.75;

/** Average wall absorption for hard CSG brushes (Sabine α). */
const AVERAGE_ABSORPTION = 0.22;

/** Sabine constant (seconds · m² / m³); game units treated as metres. */
const SABINE_RT60_CONSTANT = 0.161;

/** Mfp where wetness starts rising from a tight box. */
const MFP_WET_START = 0.6;

/** Mfp where wetness approaches the large-room plateau. */
const MFP_WET_END = 14;

/** Minimum wet gain for any solid enclosure (subtle air, not a wash). */
const MIN_ENCLOSED_WET = 0.08;

/** Maximum wet gain for large halls (realistic send, not deafening). */
const MAX_ENCLOSED_WET = 0.2;

/** Scales IR decay proxy via tailFeedback (kept moderate for short SFX). */
const MAX_TAIL_FEEDBACK = 0.36;

/** Anisotropy above this begins corridor shaping. */
const CORRIDOR_ANISOTROPY_START = 2.2;

/** Anisotropy where corridor shaping is fully applied. */
const CORRIDOR_ANISOTROPY_FULL = 5;

/**
 * Maps six world-axis ray distances (+X,−X,+Y,−Y,+Z,−Z) to continuous reverb
 * parameters via mean free path and Sabine RT60. With no solid hits, returns
 * the void character.
 *
 * @param axisRayDistances Six distances or null when that ray missed, world
 *   order.
 * @returns Room character with dry, wet, feedback, delay, gain, and lowpass
 *   values.
 */
export function resolveAudioRoomCharacterFromRayDistances(
  axisRayDistances: readonly (number | null)[],
): AudioRoomCharacter {
  if (!hasAnySolidHit(axisRayDistances)) {
    return AUDIO_ROOM_CHARACTER_VOID;
  }
  const acoustics = estimateRoomAcousticsFromRayDistances(axisRayDistances);
  return buildRoomCharacterFromAcoustics(acoustics);
}

/**
 * Maps a single average solid hit distance to a continuous room character by
 * treating all three axes as equal free lengths. When the distance is null,
 * returns the void character.
 *
 * @param averageHitDistance Average solid hit distance, or null when none.
 * @returns Continuous room character for that isotropic size, or the void
 *   character when distance is null.
 */
export function resolveAudioRoomCharacter(averageHitDistance: number | null): AudioRoomCharacter {
  if (averageHitDistance === null) {
    return AUDIO_ROOM_CHARACTER_VOID;
  }
  const axisLength = Math.max(MIN_AXIS_LENGTH, averageHitDistance * 2);
  const acoustics = estimateRoomAcousticsFromAxisTotals({
    totalX: axisLength,
    totalY: axisLength,
    totalZ: axisLength,
  });
  return buildRoomCharacterFromAcoustics(acoustics);
}

/**
 * Builds world-axis free-space totals from six opposite ray distances. One hit
 * assumes a symmetric closed wall on the opposite side (CSG enclosure).
 *
 * @param distances Six distances in +X,−X,+Y,−Y,+Z,−Z order.
 * @returns Axis totals for volume / mean-free-path sizing.
 */
export function computeWorldAxisTotals(distances: readonly (number | null)[]): AudioRoomAxisTotals {
  return {
    totalX: axisFreeLength(distances[0], distances[1]),
    totalY: axisFreeLength(distances[2], distances[3]),
    totalZ: axisFreeLength(distances[4], distances[5]),
  };
}

/**
 * Free length along one world axis from opposite rays. Both hits → sum. One hit
 * → twice that distance (closed opposite). Both miss → probe-range open extent
 * (still room-like, not dry void).
 *
 * @param positiveRay +axis distance or null.
 * @param negativeRay −axis distance or null.
 * @returns Axis free length used for volume.
 */
function axisFreeLength(positiveRay: number | null | undefined, negativeRay: number | null | undefined): number {
  const hasPositive = positiveRay !== null && positiveRay !== undefined;
  const hasNegative = negativeRay !== null && negativeRay !== undefined;
  if (hasPositive && hasNegative) {
    return positiveRay + negativeRay;
  }
  if (hasPositive) {
    return positiveRay * 2;
  }
  if (hasNegative) {
    return negativeRay * 2;
  }
  return BOTH_RAYS_MISSED_AXIS_LENGTH;
}

/**
 * Estimates volume, surface, mean free path, anisotropy, and RT60 from six
 * rays.
 *
 * @param distances Six world-axis ray distances.
 * @returns Acoustic size measures used for reverb mapping.
 */
export function estimateRoomAcousticsFromRayDistances(distances: readonly (number | null)[]): AudioRoomAcoustics {
  return estimateRoomAcousticsFromAxisTotals(computeWorldAxisTotals(distances));
}

/**
 * Estimates acoustics from precomputed axis free lengths.
 *
 * @param totals Axis free lengths Lx, Ly, Lz.
 * @returns Acoustic size measures used for reverb mapping.
 */
export function estimateRoomAcousticsFromAxisTotals(totals: AudioRoomAxisTotals): AudioRoomAcoustics {
  const safeTotals = clampAxisTotals(totals);
  const volume = safeTotals.totalX * safeTotals.totalY * safeTotals.totalZ;
  const surfaceArea = computeBoxSurfaceArea(safeTotals);
  const ordered = orderedAxisLengths(safeTotals);
  const shortMean = (ordered[0] + ordered[1]) * 0.5;
  const longTotal = ordered[2];
  return {
    totals: safeTotals,
    volume,
    surfaceArea,
    meanFreePath: computeMeanFreePath(volume, surfaceArea),
    anisotropy: longTotal / Math.max(shortMean, MIN_AXIS_LENGTH),
    shortMean,
    longTotal,
    estimatedRt60Seconds: computeSabineRt60Seconds(volume, surfaceArea),
  };
}

/**
 * Clamps each axis free length to a stable minimum.
 *
 * @param totals Raw axis totals.
 * @returns Totals with minimum lengths applied.
 */
function clampAxisTotals(totals: AudioRoomAxisTotals): AudioRoomAxisTotals {
  return {
    totalX: Math.max(MIN_AXIS_LENGTH, totals.totalX),
    totalY: Math.max(MIN_AXIS_LENGTH, totals.totalY),
    totalZ: Math.max(MIN_AXIS_LENGTH, totals.totalZ),
  };
}

/**
 * Box surface area 2(LxLy + LyLz + LzLx) from axis free lengths.
 *
 * @param totals Clamped axis totals.
 * @returns Approximate surface area.
 */
function computeBoxSurfaceArea(totals: AudioRoomAxisTotals): number {
  const lengthX = totals.totalX;
  const lengthY = totals.totalY;
  const lengthZ = totals.totalZ;
  return 2 * (lengthX * lengthY + lengthY * lengthZ + lengthZ * lengthX);
}

/**
 * Builds continuous wet/dry/delay parameters from acoustic size measures.
 *
 * @param acoustics Mean free path, RT60, and shape measures.
 * @returns Room character with wet, dry, feedback, delay, gain, and lowpass
 *   values.
 */
export function buildRoomCharacterFromAcoustics(acoustics: AudioRoomAcoustics): AudioRoomCharacter {
  const sizeBlend = computeSizeBlend(acoustics);
  const corridorBlend = computeCorridorBlend(acoustics);
  const wetGain = computeWetGain(sizeBlend, corridorBlend);
  const dryGain = computeDryGain(wetGain);
  const earlyDelayScale = computeEarlyDelayScale(acoustics, corridorBlend);
  const tailDelayScale = computeTailDelayScale(acoustics, corridorBlend);
  const tailFeedback = computeTailFeedback(acoustics, corridorBlend);
  const earlyGainScale = computeEarlyGainScale(acoustics, corridorBlend);
  const wetLowpassHz = computeWetLowpassHz(sizeBlend, corridorBlend);
  return {
    dryGain,
    wetGain,
    tailFeedback,
    earlyDelayScale,
    tailDelayScale,
    earlyGainScale,
    wetLowpassHz,
  };
}

/**
 * Blends room size from mean free path and longest axis (corridors are long
 * even when cross-section keeps mfp small).
 *
 * @param acoustics Size measures.
 * @returns 0–1 size factor for wetness and brightness.
 */
function computeSizeBlend(acoustics: AudioRoomAcoustics): number {
  const fromMfp = smoothStep(MFP_WET_START, MFP_WET_END, acoustics.meanFreePath);
  const fromLongAxis = smoothStep(8, 48, acoustics.longTotal);
  if (fromLongAxis > fromMfp) {
    return fromLongAxis;
  }
  return fromMfp;
}

/**
 * Computes the classic mean free path mfp = 4V / S. When surface area is at or
 * below a near-zero threshold, returns the minimum axis length instead.
 *
 * @param volume Room volume.
 * @param surfaceArea Room surface area.
 * @returns Mean free path in world units, or the minimum axis length when
 *   surface area is negligible.
 */
export function computeMeanFreePath(volume: number, surfaceArea: number): number {
  if (surfaceArea <= 1e-6) {
    return MIN_AXIS_LENGTH;
  }
  return (4 * volume) / surfaceArea;
}

/**
 * Sabine reverberation time RT60 = 0.161 · V / (S · α).
 *
 * @param volume Room volume (game units as metres).
 * @param surfaceArea Room surface area.
 * @returns Approximate RT60 in seconds.
 */
export function computeSabineRt60Seconds(volume: number, surfaceArea: number): number {
  const absorptionArea = surfaceArea * AVERAGE_ABSORPTION;
  if (absorptionArea <= 1e-6) {
    return 0.2;
  }
  return (SABINE_RT60_CONSTANT * volume) / absorptionArea;
}

/**
 * Returns whether any ray hit solid geometry.
 *
 * @param distances Six probe distances.
 * @returns True when at least one hit exists.
 */
function hasAnySolidHit(distances: readonly (number | null)[]): boolean {
  for (let index = 0; index < distances.length; index++) {
    if (distances[index] !== null && distances[index] !== undefined) {
      return true;
    }
  }
  return false;
}

/**
 * Returns axis lengths sorted ascending (short, mid, long).
 *
 * @param totals Axis free lengths.
 * @returns Sorted lengths.
 */
function orderedAxisLengths(totals: AudioRoomAxisTotals): [number, number, number] {
  const values = [totals.totalX, totals.totalY, totals.totalZ];
  values.sort((a, b) => a - b);
  return [values[0]!, values[1]!, values[2]!];
}

/**
 * Smooth corridor weight from anisotropy and narrow cross-section.
 *
 * @param acoustics Size and shape measures.
 * @returns 0 = isotropic, 1 = strong corridor.
 */
function computeCorridorBlend(acoustics: AudioRoomAcoustics): number {
  const anisotropyBlend = smoothStep(CORRIDOR_ANISOTROPY_START, CORRIDOR_ANISOTROPY_FULL, acoustics.anisotropy);
  const narrowBlend = 1 - smoothStep(4, 14, acoustics.shortMean);
  return anisotropyBlend * narrowBlend;
}

/**
 * Maps size and corridor blend to wet path gain.
 *
 * @param sizeBlend 0–1 large-room factor from mean free path.
 * @param corridorBlend 0–1 corridor factor.
 * @returns Wet gain.
 */
function computeWetGain(sizeBlend: number, corridorBlend: number): number {
  const base = MIN_ENCLOSED_WET + (MAX_ENCLOSED_WET - MIN_ENCLOSED_WET) * sizeBlend;
  return clamp01(base + corridorBlend * 0.025);
}

/**
 * Derives dry gain so the snap stays clear above the room wash.
 *
 * @param wetGain Wet path gain.
 * @returns Dry gain.
 */
function computeDryGain(wetGain: number): number {
  return clamp01(0.97 - wetGain * 0.35);
}

/**
 * Early reflection delay scale from mean free path; corridors tighten sides.
 *
 * @param acoustics Size measures.
 * @param corridorBlend Corridor weight.
 * @returns Early delay scale.
 */
function computeEarlyDelayScale(acoustics: AudioRoomAcoustics, corridorBlend: number): number {
  const fromMfp = clampRange(acoustics.meanFreePath / 6, 0.55, 1.85);
  const corridorTighten = 1 - corridorBlend * 0.38;
  return fromMfp * corridorTighten;
}

/**
 * Tail delay scale from RT60 and corridor length.
 *
 * @param acoustics Size measures.
 * @param corridorBlend Corridor weight.
 * @returns Tail delay scale.
 */
function computeTailDelayScale(acoustics: AudioRoomAcoustics, corridorBlend: number): number {
  const fromRt60 = clampRange(acoustics.estimatedRt60Seconds / 0.55, 0.75, 2.1);
  const fromLongAxis = smoothStep(12, 50, acoustics.longTotal) * 0.45;
  const corridorStretch = 1 + corridorBlend * 0.35;
  return (fromRt60 + fromLongAxis) * corridorStretch;
}

/**
 * Computes the IR decay proxy stored as tailFeedback (not delay-line feedback),
 * capped to the maximum tail feedback.
 *
 * @param acoustics Size measures.
 * @param corridorBlend Corridor weight.
 * @returns Capped decay proxy in the tailFeedback range.
 */
function computeTailFeedback(acoustics: AudioRoomAcoustics, corridorBlend: number): number {
  const fromRt60 = 0.2 + clampRange(acoustics.estimatedRt60Seconds * 0.1, 0, 0.1);
  const fromLength = smoothStep(10, 48, acoustics.longTotal) * 0.04;
  const flutter = corridorBlend * 0.03;
  return clampRange(fromRt60 + fromLength + flutter, 0.18, MAX_TAIL_FEEDBACK);
}

/**
 * Early tap gain scale; tight rooms and corridors get slightly stronger first
 * hits.
 *
 * @param acoustics Size measures.
 * @param corridorBlend Corridor weight.
 * @returns Early gain scale.
 */
function computeEarlyGainScale(acoustics: AudioRoomAcoustics, corridorBlend: number): number {
  const tightBoost = 1.05 - smoothStep(1, 10, acoustics.meanFreePath) * 0.15;
  return clampRange(tightBoost + corridorBlend * 0.06, 0.8, 1.12);
}

/**
 * Wet lowpass damp: keeps the wash warm and bass-biased (not hissy).
 *
 * @param sizeBlend Large-room factor.
 * @param corridorBlend Corridor weight.
 * @returns Lowpass frequency in Hz.
 */
function computeWetLowpassHz(sizeBlend: number, corridorBlend: number): number {
  const base = 1750 + sizeBlend * 700;
  return base - corridorBlend * 200;
}

/**
 * Hermite smoothstep from edge0 to edge1.
 *
 * @param edge0 Lower edge.
 * @param edge1 Upper edge.
 * @param value Input value.
 * @returns 0–1 blend.
 */
function smoothStep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Clamps a value to [0, 1].
 *
 * @param value Input.
 * @returns Clamped value.
 */
function clamp01(value: number): number {
  return clampRange(value, 0, 1);
}

/**
 * Clamps a value to [min, max].
 *
 * @param value Input.
 * @param min Lower bound.
 * @param max Upper bound.
 * @returns Clamped value.
 */
function clampRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
