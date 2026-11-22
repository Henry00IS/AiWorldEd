import { describe, expect, it } from 'vitest';
import {
  PLAYER_KEYBOARD_SHIFT_VIBRATO_CENTS,
  PLAYER_KEYBOARD_SHIFT_VIBRATO_HZ,
  PlayerKeyboardVibrato,
} from '@/player/keyboard/player_keyboard_vibrato.js';
import { playerKeyboardFakeAudio } from './player_keyboard_fake_audio.js';

describe('PlayerKeyboardVibrato', () => {
  it('starts one LFO on the first toggle on, joins the sounding voices and frees ended ones', () => {
    const audio = playerKeyboardFakeAudio(() => 1);
    const vibrato = new PlayerKeyboardVibrato();
    const voice = audio.context.createOscillator();
    vibrato.drive(voice, [voice.detune]);
    vibrato.set(audio.context, false);
    expect(audio.nodes.filter((node) => node.kind === 'oscillator')).toHaveLength(1);
    vibrato.set(audio.context, true, 0.5);
    const lfo = audio.nodes.filter((node) => node.kind === 'oscillator')[1];
    const depth = lfo?.outputs[0];
    expect((lfo?.['frequency'] as { value: number }).value).toBe(PLAYER_KEYBOARD_SHIFT_VIBRATO_HZ);
    expect(depth?.outputs).toEqual([voice.detune]);
    const eased = (depth?.['gain'] as { setTargetAtTime: { mock: { calls: number[][] } } }).setTargetAtTime.mock.calls;
    expect(eased[0]?.slice(0, 2)).toEqual([PLAYER_KEYBOARD_SHIFT_VIBRATO_CENTS, 1]);
    audio.nodes.find((node) => node.kind === 'oscillator')?.ended.forEach((end) => end());
    expect(depth?.disconnected).toBe(true);
    vibrato.dispose();
    expect(lfo?.stoppedAt).not.toBeNull();
  });
});
