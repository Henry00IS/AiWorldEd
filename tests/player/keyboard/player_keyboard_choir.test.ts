import { describe, expect, it } from 'vitest';
import { PlayerKeyboardChoir } from '@/player/keyboard/player_keyboard_choir.js';
import { PlayerKeyboardVibrato } from '@/player/keyboard/player_keyboard_vibrato.js';
import { playerKeyboardFakeAudio, type PlayerKeyboardFakeNode } from './player_keyboard_fake_audio.js';

/**
 * Sings one choir note into a fresh envelope.
 *
 * @param pitch MIDI pitch.
 * @returns Fake audio, the envelope and the lead singer.
 */
function playerKeyboardChoirSung(pitch: number): {
  audio: ReturnType<typeof playerKeyboardFakeAudio>;
  envelope: PlayerKeyboardFakeNode;
  lead: PlayerKeyboardFakeNode;
} {
  const audio = playerKeyboardFakeAudio();
  const envelope = audio.context.createGain() as unknown as PlayerKeyboardFakeNode;
  const choir = new PlayerKeyboardChoir();
  const note = { envelope: envelope as unknown as GainNode, start: 0.25 };
  const lead = choir.sing(audio.context, pitch, note, new PlayerKeyboardVibrato()) as unknown as PlayerKeyboardFakeNode;
  return { audio, envelope, lead };
}

/**
 * Returns the looping buffer source whose buffer has a channel count.
 *
 * @param nodes Nodes.
 * @param channels Channel count.
 * @returns Buffer of that source.
 */
function playerKeyboardChoirLoop(nodes: PlayerKeyboardFakeNode[], channels: number): AudioBuffer | undefined {
  const source = nodes.find(
    (node) => node.kind === 'buffersource' && (node['buffer'] as AudioBuffer).numberOfChannels === channels,
  );
  return source?.['buffer'] as AudioBuffer | undefined;
}

describe('PlayerKeyboardChoir', () => {
  it('sings five singers of one zone wave, each reading its own pitch and loudness channel, plus breath, into the envelope', () => {
    const { audio, envelope, lead } = playerKeyboardChoirSung(60);
    const singers = audio.nodes.filter((node) => node.kind === 'oscillator');
    expect(singers).toHaveLength(5);
    expect(new Set(singers.map((node) => node['wave'])).size).toBe(1);
    singers.forEach((node) => expect((node['frequency'] as { value: number }).value).toBeCloseTo(261.63, 1));
    expect(singers.map((node) => (node['detune'] as { automationRate?: string }).automationRate)).toEqual(
      Array(5).fill('k-rate'),
    );
    const split = audio.nodes.find((node) => node.kind === 'channelsplitter');
    expect(split?.outputs.slice(0, 2)).toEqual([singers[0]?.['detune'], singers[0]?.outputs[0]?.['gain']]);
    expect([...(split?.routes ?? [])].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const loops = audio.nodes.filter((node) => node.kind === 'buffersource');
    expect(loops.map((node) => [node['loop'], node.startedAt])).toEqual([
      [true, 0.25],
      [true, 0.25],
    ]);
    expect(audio.nodes.filter((node) => node.outputs.includes(envelope))).toHaveLength(6);
    expect(singers.slice(1).map((node) => node.startedAt)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(lead.startedAt).toBeNull();
  });

  it('stops the other singers, the control curves and the breath when the lead singer ends', () => {
    const { audio, lead } = playerKeyboardChoirSung(64);
    lead.ended.forEach((end) => end());
    const followers = audio.nodes.filter(
      (node) => node !== lead && (node.kind === 'oscillator' || node.kind === 'buffersource'),
    );
    expect(followers).toHaveLength(6);
    expect(followers.every((node) => node.stoppedAt !== null && node.disconnected)).toBe(true);
  });

  it('builds a wave per three-semitone zone from cosine-phase harmonics, normalized by the context', () => {
    const { audio } = playerKeyboardChoirSung(61);
    const wave = audio.nodes.find((node) => node.kind === 'oscillator')?.['wave'] as {
      real: Float32Array;
      imag: Float32Array;
      length?: number;
    };
    expect(wave.real[0]).toBe(0);
    expect(wave.imag[0]).toBe(0);
    expect(wave.real.length).toBeGreaterThan(30);
    expect(Math.max(...wave.real.map(Math.abs), ...wave.imag.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(playerKeyboardChoirSung(60).audio.nodes.find((node) => node.kind === 'oscillator')?.['wave']).toEqual(wave);
    const higher = playerKeyboardChoirSung(62).audio.nodes.find((node) => node.kind === 'oscillator')?.['wave'];
    expect((higher as { real: Float32Array }).real.length).toBeLessThan(wave.real.length);
  });

  it('loops control curves seamlessly: pitch around each singer detune within its vibrato and jitter, loudness shimmering around an equal share', () => {
    const { audio } = playerKeyboardChoirSung(60);
    const control = playerKeyboardChoirLoop(audio.nodes, 10);
    expect(control?.duration).toBeGreaterThanOrEqual(4);
    expect(control?.sampleRate).toBe(48000);
    const detunes = [-12, -5, 0, 6, 11];
    detunes.forEach((detune, singer) => {
      const pitch = control?.getChannelData(singer) ?? new Float32Array();
      const mean = pitch.reduce((sum, value) => sum + value, 0) / pitch.length;
      expect(Math.abs(mean - detune)).toBeLessThan(4);
      expect(pitch.reduce((most, value) => Math.max(most, Math.abs(value - detune)), 0)).toBeLessThan(45);
      expect(Math.abs((pitch[0] ?? 0) - (pitch.at(-1) ?? 0))).toBeLessThan(1.5);
      const level = control?.getChannelData(5 + singer) ?? new Float32Array();
      expect(level.reduce((most, value) => Math.max(most, Math.abs(value * Math.sqrt(5) - 1)), 0)).toBeLessThan(0.05);
    });
  });

  it('loops breath at a quiet fixed level and makes the sound once per context for every note', () => {
    const audio = playerKeyboardFakeAudio();
    const choir = new PlayerKeyboardChoir();
    const note = { envelope: audio.context.createGain(), start: 0 };
    choir.preload(audio.context);
    choir.sing(audio.context, 60, note, new PlayerKeyboardVibrato());
    choir.sing(audio.context, 72, note, new PlayerKeyboardVibrato());
    const breaths = audio.nodes.filter(
      (node) => node.kind === 'buffersource' && (node['buffer'] as AudioBuffer).numberOfChannels === 1,
    );
    expect(breaths).toHaveLength(2);
    expect(breaths[0]?.['buffer']).toBe(breaths[1]?.['buffer']);
    const breath = (breaths[0]?.['buffer'] as AudioBuffer).getChannelData(0);
    const level = Math.sqrt(breath.reduce((sum, value) => sum + value * value, 0) / breath.length);
    expect(level).toBeCloseTo(0.03, 4);
  });
});
