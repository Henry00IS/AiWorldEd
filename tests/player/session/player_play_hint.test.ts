import { describe, expect, it } from 'vitest';
import { playerPlayHint } from '@/player/session/player_play_hint.js';

describe('playerPlayHint', () => {
  it('names the wheel for toys only in first person, and only the unobvious keyboard controls', () => {
    expect(playerPlayHint('first_person', null)).toContain('1-6 or wheel pick toy');
    expect(playerPlayHint('third_person', null)).not.toContain('wheel');
    expect(playerPlayHint('first_person', 'Sine')).toMatch(
      /^Keyboard: Sine, octave 1 — LMB put away.*instrument, ↑\/↓ octave, Shift vibrato.*wheel pick toy/,
    );
    expect(playerPlayHint('third_person', 'Sine')).toMatch(
      /LMB put away \(then 1-6 pick toy\).*instrument, ↑\/↓ octave, Shift vibrato/,
    );
    expect(playerPlayHint('third_person', 'Sine')).not.toContain('wheel');
  });

  it('names the instrument only while the keyboard is out', () => {
    expect(playerPlayHint('first_person', 'Organ')).toMatch(/^Keyboard: Organ, octave 1 — LMB put away/);
    expect(playerPlayHint('first_person', 'Organ', 1)).toMatch(/^Keyboard: Organ, octave 2 — /);
    expect(playerPlayHint('first_person', null)).not.toContain('Keyboard');
  });

  it('names the grapple controls while the beam is picked', () => {
    expect(playerPlayHint('first_person', null, 0, true)).toBe(
      'Play mode — ESC exit, hold LMB grapple, let go to fly, 1-6 or wheel pick toy, RMB third-person',
    );
    expect(playerPlayHint('third_person', null, 0, true)).toBe(
      'Third-person — ESC exit, hold LMB grapple, let go to fly, 1-6 pick toy, RMB first-person',
    );
  });
});
