import { describe, expect, it } from 'vitest';
import { AudioOutputClockGate } from '@/audio/context/audio_output_clock_gate.js';

describe('AudioOutputClockGate', () => {
  it('never schedules while the context is suspended', () => {
    const gate = new AudioOutputClockGate();
    const context = createClockContext('suspended', 0);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = 1;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = 2;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
  });

  it('never schedules while a running clock stays on one sample', () => {
    const gate = new AudioOutputClockGate();
    const context = createClockContext('running', 12.5);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
  });

  it('schedules after the running sample changes, including a downward step', () => {
    const gate = new AudioOutputClockGate();
    const context = createClockContext('running', 4);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = -1;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(true);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(true);
  });

  it('does not latch on a non-finite sample', () => {
    const gate = new AudioOutputClockGate();
    const context = createClockContext('running', 0);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = Number.NaN;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = Number.POSITIVE_INFINITY;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = 0;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = 0.25;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(true);
  });

  it('requires a new sample change after invalidate while time stays non-zero', () => {
    const gate = new AudioOutputClockGate();
    const context = createClockContext('running', 3);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = 3.5;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(true);
    gate.invalidate();
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(false);
    context.currentTime = 3.75;
    expect(gate.canScheduleOneShot(asAudioContext(context))).toBe(true);
  });
});

/**
 * Builds a mutable clock stand-in for gate samples.
 *
 * @param state Initial context state.
 * @param currentTime Initial currentTime sample.
 * @returns Mutable state and currentTime.
 */
function createClockContext(state: AudioContextState, currentTime: number): ClockContext {
  return { state, currentTime };
}

/**
 * Presents a clock stand-in as an AudioContext.
 *
 * @param context Mutable clock stand-in.
 * @returns The same object typed as AudioContext.
 */
function asAudioContext(context: ClockContext): AudioContext {
  return context as unknown as AudioContext;
}

/** State and currentTime read by the output clock gate. */
interface ClockContext {
  state: AudioContextState;
  currentTime: number;
}
