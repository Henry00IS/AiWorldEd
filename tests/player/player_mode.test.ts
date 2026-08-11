import { describe, expect, it } from 'vitest';
import { playerViewModeToggle } from '@/player/player_mode.js';

describe('playerViewModeToggle', () => {
  it('switches first-person to third-person', () => {
    expect(playerViewModeToggle('first_person')).toBe('third_person');
  });

  it('switches third-person to first-person', () => {
    expect(playerViewModeToggle('third_person')).toBe('first_person');
  });
});
