import { describe, expect, it } from 'vitest';
import { createBundledGameProfiles, createSeededGameProfiles } from '@/settings/profiles/game_profile_defaults.js';

describe('game_profile_defaults', () => {
  it('should expose the supplied engine profiles with their export settings', () => {
    const profiles = createBundledGameProfiles();

    expect(profiles).toEqual([
      expect.objectContaining({
        id: '68dd0f30-fc26-4c82-9d27-69bf3cefd4a0',
        name: 'Blender',
        unitSystem: 'metric',
        metricUnit: 'millimeter',
        imperialUnit: 'foot',
        coordinateSpace: expect.objectContaining({
          presetId: 'blender',
          name: 'Blender',
          handedness: 'right',
          up: '+z',
          right: '+x',
          forward: '+y',
          isCustom: false,
        }),
      }),
      expect.objectContaining({
        id: '416d0449-8415-4571-a4dd-09d2a20ee0c0',
        name: 'Unity',
        unitSystem: 'metric',
        metricUnit: 'meter',
        imperialUnit: 'foot',
        coordinateSpace: expect.objectContaining({
          presetId: 'unity',
          name: 'Unity',
          handedness: 'left',
          up: '+y',
          right: '+x',
          forward: '+z',
          isCustom: false,
        }),
      }),
      expect.objectContaining({
        id: '069afca1-fe65-44d7-9a91-b4b904e3b7e2',
        name: 'Godot',
        unitSystem: 'metric',
        metricUnit: 'meter',
        imperialUnit: 'foot',
        coordinateSpace: expect.objectContaining({
          presetId: 'godot',
          name: 'Godot',
          handedness: 'right',
          up: '+y',
          right: '+x',
          forward: '-z',
          isCustom: false,
        }),
      }),
      expect.objectContaining({
        id: '27c48a11-8ea1-4bbd-98f9-a879db8d09f0',
        name: 'Unreal',
        unitSystem: 'metric',
        metricUnit: 'centimeter',
        imperialUnit: 'foot',
        coordinateSpace: expect.objectContaining({
          presetId: 'unreal',
          name: 'Unreal Engine',
          handedness: 'left',
          up: '+z',
          right: '+y',
          forward: '+x',
          isCustom: false,
        }),
      }),
    ]);
  });

  it('should create independent seeded profile collections', () => {
    const first = createSeededGameProfiles('default-one');
    const second = createSeededGameProfiles('default-two');

    first[1]!.name = 'Changed';

    expect(first[0]!.id).toBe('default-one');
    expect(second[0]!.id).toBe('default-two');
    expect(second[1]!.name).toBe('Blender');
  });
});
