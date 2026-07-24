import { describe, it, expect } from 'vitest';
import {
  buildGameProfileFileName,
  parseGameProfileJson,
  serializeGameProfileToJson
} from '../../src/settings/game_profile_json.js';
import { createDefaultGameProfile } from '../../src/settings/settings_defaults.js';

describe('game_profile_json', () => {
  it('should serialize one game profile as a versioned JSON document', () => {
    const profile = createDefaultGameProfile('profile-1', 'Arena FPS');
    profile.unitSystem = 'imperial';
    profile.imperialUnit = 'inch';
    const json = serializeGameProfileToJson(profile);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.id).toBe('profile-1');
    expect(parsed.name).toBe('Arena FPS');
    expect(parsed.unitSystem).toBe('imperial');
    expect(parsed.imperialUnit).toBe('inch');
    expect(parsed.metricUnit).toBe('meter');
    expect(parsed.coordinateSpace.presetId).toBe('godot');
  });

  it('should round-trip a profile through JSON text', () => {
    const profile = createDefaultGameProfile('abc', 'RPG');
    profile.metricUnit = 'centimeter';
    profile.coordinateSpace = {
      presetId: 'unreal',
      name: 'Unreal Engine',
      handedness: 'left',
      up: '+z',
      right: '+y',
      forward: '+x',
      isCustom: false
    };
    const restored = parseGameProfileJson(serializeGameProfileToJson(profile));
    expect(restored).toEqual(profile);
  });

  it('should default coordinate space when loading legacy v1 profiles', () => {
    const restored = parseGameProfileJson(
      JSON.stringify({
        version: 1,
        id: 'legacy',
        name: 'Old',
        unitSystem: 'metric',
        metricUnit: 'meter',
        imperialUnit: 'foot'
      })
    );
    expect(restored.coordinateSpace.presetId).toBe('godot');
    expect(restored.coordinateSpace.up).toBe('+y');
  });

  it('should reject invalid unit systems', () => {
    expect(() =>
      parseGameProfileJson(
        JSON.stringify({
          version: 1,
          id: 'x',
          name: 'Bad',
          unitSystem: 'cubits',
          metricUnit: 'meter',
          imperialUnit: 'foot'
        })
      )
    ).toThrow(/unitSystem/);
  });

  it('should build a safe json filename from the profile name', () => {
    expect(buildGameProfileFileName('My Cool Game')).toBe('My_Cool_Game.json');
    expect(buildGameProfileFileName('a/b\\c:d')).toBe('a_b_c_d.json');
  });
});
