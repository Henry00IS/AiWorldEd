import { beforeEach, describe, expect, it } from 'vitest';
import { foldSnapSpeedEmaAtTime, NotificationFrameEvents } from '@/audio/notification/notification_frame_events.js';

describe('NotificationFrameEvents', () => {
  let events: NotificationFrameEvents;

  beforeEach(() => {
    events = new NotificationFrameEvents();
  });

  it('starts with empty snapshots', () => {
    expect(events.hasSelectionMovedWithSnappingSnapshot()).toBe(false);
    expect(events.hasSelectionScaledWithSnappingSnapshot()).toBe(false);
    expect(events.hasAnySnapFeedbackSnapshot()).toBe(false);
  });

  it('snapshots move and scale flags independently', () => {
    events.raiseSelectionMovedWithSnapping();
    events.raiseSelectionScaledWithSnapping();
    events.beginFrame();
    expect(events.hasSelectionMovedWithSnappingSnapshot()).toBe(true);
    expect(events.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    expect(events.hasAnySnapFeedbackSnapshot()).toBe(true);
    events.beginFrame();
    expect(events.hasAnySnapFeedbackSnapshot()).toBe(false);
  });

  it('reset clears pending and snapshot flags', () => {
    events.raiseSelectionMovedWithSnapping();
    events.beginFrame();
    events.reset();
    expect(events.hasAnySnapFeedbackSnapshot()).toBe(false);
  });

  it('snapshots a positive move-speed EMA after rapid snap steps', () => {
    events.raiseSelectionMovedWithSnapping(1);
    events.raiseSelectionMovedWithSnapping(1);
    events.raiseSelectionMovedWithSnapping(1);
    events.beginFrame();
    expect(events.getSelectionMovedSpeedSnapshot()).toBeGreaterThan(0);
    events.beginFrame();
    expect(events.getSelectionMovedSpeedSnapshot()).toBe(0);
  });

  it('snapshots resize travel for pitch and clears it next frame', () => {
    events.raiseSelectionResizedWithSnapping(6);
    events.beginFrame();
    expect(events.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    expect(events.getSelectionResizeTravelSnapshot()).toBe(6);
    events.beginFrame();
    expect(events.getSelectionResizeTravelSnapshot()).toBe(0);
  });

  it('snapshots scale travel for pitch the same way as resize', () => {
    events.raiseSelectionScaledWithSnapping(4.5);
    events.beginFrame();
    expect(events.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    expect(events.getSelectionResizeTravelSnapshot()).toBe(4.5);
  });

  it('snapshots rotate speed EMA after rapid angle steps', () => {
    events.raiseSelectionRotatedWithSnapping(0.15);
    events.raiseSelectionRotatedWithSnapping(0.15);
    events.beginFrame();
    expect(events.hasSelectionRotatedWithSnappingSnapshot()).toBe(true);
    expect(events.getSelectionRotatedSpeedSnapshot()).toBeGreaterThan(0);
  });

  it('snapshots player footstep pose and speed', () => {
    events.raisePlayerFootstep(1.5, 0.1, -2.25, 4.5);
    events.beginFrame();
    expect(events.hasPlayerFootstepSnapshot()).toBe(true);
    expect(events.getPlayerFootstepWorldXSnapshot()).toBeCloseTo(1.5, 5);
    expect(events.getPlayerFootstepWorldYSnapshot()).toBeCloseTo(0.1, 5);
    expect(events.getPlayerFootstepWorldZSnapshot()).toBeCloseTo(-2.25, 5);
    expect(events.getPlayerFootstepSpeedSnapshot()).toBeCloseTo(4.5, 5);
    expect(events.hasAnySnapFeedbackSnapshot()).toBe(true);
    events.beginFrame();
    expect(events.hasPlayerFootstepSnapshot()).toBe(false);
  });
});

describe('foldSnapSpeedEmaAtTime', () => {
  it('yields the same speed for the same world motion at 8fps and 60fps spacing', () => {
    const worldUnitsPerSecond = 24;
    const ema60 = simulateConstantSpeed(worldUnitsPerSecond, 1000 / 60, 12);
    const ema8 = simulateConstantSpeed(worldUnitsPerSecond, 1000 / 8, 4);
    expect(ema60).toBeCloseTo(worldUnitsPerSecond, 0);
    expect(ema8).toBeCloseTo(worldUnitsPerSecond, 0);
    expect(Math.abs(ema60 - ema8)).toBeLessThan(2);
  });
});

/**
 * Runs a constant wall-clock speed through the EMA for several samples.
 *
 * @param speedUnitsPerSecond Target world speed.
 * @param dtMs Interval between samples.
 * @param sampleCount Number of raises to fold.
 * @returns Final EMA value.
 */
function simulateConstantSpeed(speedUnitsPerSecond: number, dtMs: number, sampleCount: number): number {
  let ema = 0;
  let lastMs = 0;
  for (let index = 0; index < sampleCount; index++) {
    const nowMs = lastMs <= 0 ? 1000 : lastMs + dtMs;
    const stepLength = speedUnitsPerSecond * (dtMs * 0.001);
    ema = foldSnapSpeedEmaAtTime(ema, stepLength, lastMs, nowMs);
    lastMs = nowMs;
  }
  return ema;
}
