import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { PlayerKeyboardInstrument } from '@/player/keyboard/player_keyboard_instruments.js';
import { audioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { AUDIO_ROOM_CHARACTER_DRY_2D, AUDIO_ROOM_CHARACTER_OPEN } from '@/audio/space/audio_room_character.js';
import { audioSpaceProbe } from '@/audio/space/audio_space_probe.js';
import { audioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import { PlayerKeyboardSynth } from '@/player/keyboard/player_keyboard_synth.js';
import {
  PLAYER_KEYBOARD_SHIFT_VIBRATO_CENTS,
  PLAYER_KEYBOARD_SHIFT_VIBRATO_HZ,
} from '@/player/keyboard/player_keyboard_vibrato.js';
import { playerKeyboardFakeAudio, type PlayerKeyboardFakeNode } from './player_keyboard_fake_audio.js';

const samples = vi.hoisted(() => ({ load: vi.fn((..._: unknown[]) => ({ duration: 1 }) as AudioBuffer) }));

vi.mock('@/player/keyboard/player_keyboard_samples.js', () => ({ playerKeyboardSampleLoad: samples.load }));

/**
 * Returns the peak an envelope gain was ramped to.
 *
 * @param gain Gain node double.
 * @returns Peak.
 */
function peakOf(gain: { [field: string]: unknown }): number {
  const ramp = (gain['gain'] as { linearRampToValueAtTime: { mock: { calls: number[][] } } }).linearRampToValueAtTime;
  return ramp.mock.calls[0]?.[0] ?? 0;
}

describe('PlayerKeyboardSynth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('plays notes through one output at 80% after the limiter, panned at the keyboard as mono and sent into the shared reverb from the panner', () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    synth.place(new THREE.Vector3(1, 2, 3));
    synth.noteOn(69, 0);
    synth.noteOn(72, 1);
    expect(synth.getVoiceCount()).toBe(2);
    const oscillators = audio.nodes.filter((node) => node.kind === 'oscillator');
    expect(oscillators.map((node) => [node['type'], (node['frequency'] as { value: number }).value])).toEqual([
      ['sine', 440],
      ['square', expect.closeTo(523.25, 1)],
    ]);
    const panner = audio.nodes.find((node) => node.outputs.includes(audio.wet));
    const limiter = audio.nodes.find((node) => node.kind === 'dynamicscompressor');
    const volume = limiter?.outputs[0];
    expect(limiter?.outputs).toHaveLength(1);
    expect(volume?.kind).toBe('gain');
    expect((volume?.['gain'] as { value: number }).value * Math.SQRT1_2).toBeCloseTo(0.8);
    expect([volume?.['channelCount'], volume?.['channelCountMode']]).toEqual([1, 'explicit']);
    expect(volume?.outputs).toEqual([panner]);
    expect(panner?.kind).toBe('panner');
    expect(panner?.outputs.map((node) => node.kind)).toEqual(['destination', 'wet']);
    expect(audio.placed.at(-1)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("sounds a transposed note an octave up on the key's voice, so the key's note-off ends it", () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    synth.noteOn(60, 0, undefined, 12);
    const oscillator = audio.nodes.find((node) => node.kind === 'oscillator');
    expect((oscillator?.['frequency'] as { value: number }).value).toBeCloseTo(523.25, 1);
    synth.noteOff(60);
    expect(oscillator?.stoppedAt).not.toBeNull();
  });

  it('fades the keyboard with distance: full within 6 m, about -30 dB at 40 m', () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    synth.noteOn(60, 0);
    const panner = audio.nodes.find((node) => node.kind === 'panner');
    expect(panner?.['distanceModel']).toBe('exponential');
    const reference = panner?.['refDistance'] as number;
    const rolloff = panner?.['rolloffFactor'] as number;
    const decibels = (meters: number): number => 20 * Math.log10((Math.max(meters, reference) / reference) ** -rolloff);
    expect(decibels(6)).toBe(0);
    expect(decibels(10)).toBeCloseTo(-8.1, 0);
    expect(decibels(20)).toBeCloseTo(-19, 0);
    expect(decibels(40)).toBeLessThanOrEqual(-29.5);
    expect(decibels(40)).toBeGreaterThan(-32);
    expect(panner?.['maxDistance']).toBeGreaterThan(100);
  });

  it('holds every note envelope silent before its automation, so a note the audio thread renders early never sounds at full gain', () => {
    const audio = playerKeyboardFakeAudio();
    const createGain = audio.context.createGain.bind(audio.context);
    const before: number[] = [];
    vi.spyOn(audio.context, 'createGain').mockImplementation(() => {
      const node = createGain();
      const gain = node.gain as unknown as { value: number; setValueAtTime: (value: number, at: number) => void };
      const schedule = gain.setValueAtTime.bind(gain);
      gain.setValueAtTime = (value, at) => (before.push(gain.value), schedule(value, at));
      return node;
    });
    const synth = new PlayerKeyboardSynth(() => audio.context);
    [0, 1, 2, 4, 5].forEach((slot, index) => synth.noteOn(60 + index, slot));
    expect(before.length).toBeGreaterThanOrEqual(4);
    expect(before.every((value) => value === 0)).toBe(true);
  });

  it('keeps the square quieter than the sine and releases notes with a short tail', () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    synth.noteOn(60, 0);
    synth.noteOn(62, 1);
    const peaks = audio.nodes
      .filter((node) => node.kind === 'gain')
      .map(peakOf)
      .filter((peak) => peak > 0);
    expect(peaks).toHaveLength(2);
    expect(peaks[1]).toBeLessThan((peaks[0] ?? 0) / 2);
    synth.noteOff(60);
    expect(synth.getVoiceCount()).toBe(1);
    const stopped = audio.nodes.find((node) => node.stoppedAt !== null);
    expect(stopped?.stoppedAt).toBeGreaterThan(0.15);
    expect(stopped?.stoppedAt).toBeLessThan(0.5);
  });

  it('pitches samples from the root note and loops only with a configured loop', () => {
    const audio = playerKeyboardFakeAudio();
    const instruments: PlayerKeyboardInstrument[] = [
      { label: 'Once', sampleUrl: 'once.wav', rootPitch: 60, level: 1 },
      { label: 'Held', sampleUrl: 'held.wav', rootPitch: 60, level: 1, loop: { start: 0.1, end: 0.4 } },
    ];
    const synth = new PlayerKeyboardSynth(() => audio.context, instruments);
    synth.noteOn(72, 0);
    synth.noteOn(67, 1);
    const [once, held] = audio.nodes.filter((node) => node.kind === 'buffersource');
    expect((once?.['playbackRate'] as { value: number }).value).toBeCloseTo(2);
    expect(once?.['loop']).toBeUndefined();
    expect([held?.['loop'], held?.['loopStart'], held?.['loopEnd']]).toEqual([true, 0.1, 0.4]);
  });

  it('plays a layered slot as one voice per key: both layers at the layer share, each released with its own tail', () => {
    const audio = playerKeyboardFakeAudio();
    const instruments: PlayerKeyboardInstrument[] = [
      { label: 'Held', sampleUrl: 'held.wav', rootPitch: 60, level: 2, release: 0.06, loop: { start: 0, end: 1 } },
      { label: 'Once', sampleUrl: 'once.wav', rootPitch: 60, level: 1 },
      { label: 'Both', layers: [0, 1], level: 0.5 },
    ];
    const synth = new PlayerKeyboardSynth(() => audio.context, instruments);
    synth.noteOn(60, 0);
    synth.noteOn(62, 2);
    synth.noteOn(62, 2);
    expect(synth.getVoiceCount()).toBe(2);
    const sources = audio.nodes.filter((node) => node.kind === 'buffersource');
    expect(sources.map((node) => node['loop'])).toEqual([true, true, undefined, true, undefined]);
    const peaks = audio.nodes.map(peakOf).filter((peak) => peak > 0);
    expect([peaks[1], peaks[2]]).toEqual([(peaks[0] ?? 0) / 2, (peaks[0] ?? 0) / 4]);
    expect(sources.slice(1, 3).every((node) => node.stoppedAt !== null)).toBe(true);
    synth.noteOff(62);
    expect(synth.getVoiceCount()).toBe(1);
    const [held, once] = sources.slice(3).map((node) => node.stoppedAt ?? 0);
    expect(held).toBeCloseTo(0.06 * 8);
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(held ?? 0);
  });

  it('fades every note in a few milliseconds when disposed and frees its nodes', () => {
    vi.useFakeTimers();
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    [60, 64, 67].forEach((pitch) => synth.noteOn(pitch, 2));
    synth.dispose();
    expect([synth.getVoiceCount(), synth.hasOutput()]).toEqual([0, false]);
    const stops = audio.nodes.filter((node) => node.stoppedAt !== null).map((node) => node.stoppedAt ?? 1);
    expect(stops).toHaveLength(3);
    expect(Math.max(...stops)).toBeLessThan(0.05);
    audio.endStopped();
    vi.advanceTimersByTime(300);
    expect(
      audio.nodes.filter((node) => node.kind === 'gain' || node.kind === 'panner').every((node) => node.disconnected),
    ).toBe(true);
    synth.noteOn(60, 0);
    expect(synth.getVoiceCount()).toBe(0);
  });

  it('limits the bus near -3.4 dBFS so a pile of voices cannot blast or clip, keeping quiet playing at its level', () => {
    const audio = playerKeyboardFakeAudio();
    new PlayerKeyboardSynth(() => audio.context).noteOn(60, 0);
    const limiter = audio.nodes.find((node) => node.kind === 'dynamicscompressor');
    const value = (name: string): number => (limiter?.[name] as { value: number }).value;
    expect([value('threshold'), value('knee'), value('ratio')]).toEqual([-8, 0, 20]);
    const input = audio.nodes.find((node) => node.outputs.includes(limiter as never));
    expect((input?.['gain'] as { value: number }).value).toBeCloseTo(0.5916, 3);
  });

  it('never leaves a voice at full gain when it ends in the tick it started (key mashing)', () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    for (let round = 0; round < 3; round++)
      [60, 62, 64, 60].forEach((pitch) => (synth.noteOn(pitch, 0), synth.noteOff(pitch)));
    const sets = audio.nodes
      .filter((node) => node.kind === 'gain')
      .flatMap(
        (node) => (node['gain'] as { setValueAtTime: { mock: { calls: number[][] } } }).setValueAtTime.mock.calls,
      );
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.every(([value]) => value === 0)).toBe(true);
    expect(synth.getVoiceCount()).toBe(0);
  });

  it('keeps one voice per key: a retrigger fades the old voice out quickly', () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    [60, 60, 60].forEach((pitch) => synth.noteOn(pitch, 0));
    expect(synth.getVoiceCount()).toBe(1);
    const sources = audio.nodes.filter((node) => node.kind === 'oscillator');
    expect(sources.map((node) => node.stoppedAt !== null && node.stoppedAt < 0.05)).toEqual([true, true, false]);
  });

  it('starts and releases scheduled notes at their audio time, past times at once', () => {
    let time = 1;
    const audio = playerKeyboardFakeAudio(() => time);
    const synth = new PlayerKeyboardSynth(() => audio.context);
    synth.noteOn(60, 0, 1.5);
    synth.noteOff(60, 1.7);
    synth.noteOn(64, 0, 0.5);
    const [late, past] = audio.nodes.filter((node) => node.kind === 'oscillator');
    expect([late?.startedAt, past?.startedAt]).toEqual([1.5, 1]);
    const release = late?.outputs[0]?.outputs[0]?.['gain'] as { setTargetAtTime: { mock: { calls: number[][] } } };
    expect(release.setTargetAtTime.mock.calls).toEqual([[0, 1.7, expect.closeTo(0.045, 3)]]);
    synth.noteOn(67, 0, 2);
    time = 1.2;
    synth.dispose();
    const unstarted = audio.nodes.filter((node) => node.kind === 'oscillator').at(-1);
    expect(unstarted?.stoppedAt).toBe(1.2);
  });

  it('plays the organ from drawbar partials over half the pitch, held at full level, released quickly, vibrato stopping with it', () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    synth.noteOn(60, 3);
    const [organ, vibrato] = audio.nodes.filter((node) => node.kind === 'oscillator');
    expect((organ?.['frequency'] as { value: number }).value).toBeCloseTo(130.81, 1);
    expect([1, 2, 4, 6, 8].map((harmonic) => (organ?.['wave'] as { imag: Float32Array }).imag[harmonic])).toEqual([
      0.5,
      1,
      expect.closeTo(0.7, 5),
      expect.closeTo(0.45, 5),
      expect.closeTo(0.35, 5),
    ]);
    expect(vibrato?.outputs[0]?.outputs[0]).toBe(organ?.['detune']);
    const envelope = organ?.outputs[0]?.['gain'] as { setTargetAtTime: { mock: { calls: number[][] } } };
    expect(envelope.setTargetAtTime.mock.calls[0]?.[0]).toBeCloseTo(0.3 * 0.78, 5);
    synth.noteOff(60);
    expect(organ?.stoppedAt).toBeCloseTo(0.018 * 8, 5);
    audio.endStopped();
    expect(vibrato?.stoppedAt).not.toBeNull();
  });

  it('sings the choir through its five singers and breath straight into the output, with a soft attack and every singer on the Shift vibrato', () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    synth.noteOn(60, 5, 0.5);
    synth.vibratoSet(true, 0.5);
    const singers = audio.nodes.filter((node) => node.kind === 'oscillator' && node['wave'] !== undefined);
    expect(singers).toHaveLength(5);
    expect(singers.map((node) => node.startedAt)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    const envelope = singers[0]?.outputs[0]?.outputs[0];
    const ramp = (envelope?.['gain'] as { linearRampToValueAtTime: { mock: { calls: number[][] } } })
      .linearRampToValueAtTime.mock.calls[0];
    expect((ramp?.[1] ?? 0) - 0.5).toBeCloseTo(0.12, 5);
    expect(envelope?.outputs[0]?.outputs[0]?.outputs[0]?.kind).toBe('dynamicscompressor');
    const depth = audio.nodes.find((node) => node.kind === 'oscillator' && node['wave'] === undefined)?.outputs[0];
    expect(depth?.outputs).toEqual(expect.arrayContaining(singers.map((node) => node['detune'])));
    synth.noteOff(60);
    audio.endStopped();
    expect(audio.nodes.filter((node) => node.kind === 'buffersource').map((node) => node.stoppedAt)).not.toContain(
      null,
    );
  });

  it('eases one shared Shift vibrato into every voice of every slot, joining voices already sounding', () => {
    const audio = playerKeyboardFakeAudio(() => 2);
    const synth = new PlayerKeyboardSynth(() => audio.context);
    const hertz = (node: PlayerKeyboardFakeNode): number => (node['frequency'] as { value: number }).value;
    const lfos = (): PlayerKeyboardFakeNode[] =>
      audio.nodes.filter((node) => node.kind === 'oscillator' && hertz(node) === PLAYER_KEYBOARD_SHIFT_VIBRATO_HZ);
    synth.noteOn(60, 0);
    synth.noteOn(64, 4);
    expect(lfos()).toHaveLength(0);
    synth.vibratoSet(true, 2.5);
    synth.noteOn(67, 0);
    const voices = audio.nodes.filter(
      (node) => node.kind === 'buffersource' || (node.kind === 'oscillator' && hertz(node) > 100),
    );
    const depth = lfos()[0]?.outputs[0];
    expect(lfos()).toHaveLength(1);
    expect(depth?.outputs).toEqual(voices.map((voice) => voice['detune']));
    synth.vibratoSet(false, 1);
    const eased = (depth?.['gain'] as { setTargetAtTime: { mock: { calls: number[][] } } }).setTargetAtTime.mock.calls;
    expect(eased).toEqual([
      [PLAYER_KEYBOARD_SHIFT_VIBRATO_CENTS, 2.5, expect.closeTo(0.05, 3)],
      [0, 2, expect.closeTo(0.083, 3)],
    ]);
    expect(lfos()).toHaveLength(1);
  });

  it('sets the shared reverb to the room at the keyboard before each note, dry on a 2D view', () => {
    const audio = playerKeyboardFakeAudio();
    const synth = new PlayerKeyboardSynth(() => audio.context);
    const sample = vi.spyOn(audioSpaceProbe, 'sampleRoomCharacterAt').mockReturnValue({ ...AUDIO_ROOM_CHARACTER_OPEN });
    const apply = vi.spyOn(audioEffectSoftReverb, 'applyRoomCharacter');
    const focus = vi.spyOn(audioViewportFocus, 'getPerspectiveCamera').mockReturnValue(new THREE.PerspectiveCamera());
    synth.place(new THREE.Vector3(4, 1, -2));
    synth.noteOn(60, 0);
    expect(sample.mock.calls.at(-1)?.[0].toArray()).toEqual([4, 1, -2]);
    expect(apply.mock.calls.at(-1)?.[0]).toEqual(AUDIO_ROOM_CHARACTER_OPEN);
    focus.mockReturnValue(null);
    synth.noteOn(62, 0);
    expect(apply.mock.calls.at(-1)?.[0]).toEqual(AUDIO_ROOM_CHARACTER_DRY_2D);
  });

  it('stays silent with editor audio off and skips empty sample slots', () => {
    const synth = new PlayerKeyboardSynth(() => null);
    synth.noteOn(60, 0);
    expect(synth.getVoiceCount()).toBe(0);
    const audio = playerKeyboardFakeAudio();
    const empty: PlayerKeyboardInstrument[] = [{ label: 'Empty', sampleUrl: null, rootPitch: 60, level: 1 }];
    const silent = new PlayerKeyboardSynth(() => audio.context, empty);
    silent.noteOn(60, 0);
    expect(silent.getVoiceCount()).toBe(0);
  });

  it('preloads the sample slots and only with editor audio on', () => {
    samples.load.mockClear();
    new PlayerKeyboardSynth(() => null).preload();
    expect(samples.load).not.toHaveBeenCalled();
    const audio = playerKeyboardFakeAudio();
    new PlayerKeyboardSynth(() => audio.context).preload();
    expect(samples.load.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
      expect.stringContaining('keyboard_piano'),
      expect.stringContaining('keyboard_strings'),
    ]);
  });
});
