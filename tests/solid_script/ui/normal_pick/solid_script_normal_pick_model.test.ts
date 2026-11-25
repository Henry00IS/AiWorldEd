import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptParameterTakesDirection } from '@/solid_script/commands/solid_script_parameter_direction.js';
import {
  solidScriptNormalPickFaces,
  solidScriptNormalPickText,
} from '@/solid_script/ui/normal_pick/solid_script_normal_pick_model.js';
import { solidScriptSuggestionActions } from '@/solid_script/ui/solid_script_suggestions.js';

/**
 * Finds a field of a command.
 *
 * @param id Command id.
 * @param key Field key.
 * @returns Field.
 */
function field(id: string, key: string) {
  const found = solidScriptCommands.find((command) => command.id === id)?.parameters.find((entry) => entry.key === key);
  expect(found, `${id}.${key}`).toBeTruthy();
  return found as NonNullable<typeof found>;
}

describe('Pick Normal faces', () => {
  it('are the 26 faces of the grid aligned shape, each facing its own direction', () => {
    const faces = solidScriptNormalPickFaces();
    expect(faces).toHaveLength(26);
    for (const face of faces) {
      const [a, b, c] = face.loop;
      const normal = new THREE.Vector3().crossVectors(b!.clone().sub(a!), c!.clone().sub(a!)).normalize();
      expect(normal.dot(face.direction.unit)).toBeCloseTo(1, 8);
    }
    expect(new Set(faces.map((face) => face.direction.lines.join(' '))).size).toBe(26);
  });

  it('labels axis faces like +X, edge faces with 45° and corner faces with all three axes', () => {
    const labels = solidScriptNormalPickFaces().map((face) => face.direction.lines.join(' '));
    expect(labels).toEqual(expect.arrayContaining(['+X', '-Y', '+Z', '+X+Y 45°', '-Y-Z 45°', '+X-Y+Z']));
  });

  it('writes readable directions, as every direction field turns its value into a unit direction', () => {
    const texts = solidScriptNormalPickFaces().map((face) => solidScriptNormalPickText(face.direction));
    expect(texts).toEqual(expect.arrayContaining(['1, 0, 0', '0, -1, 0', '1, 1, 0', '-1, 1, -1']));
  });

  it('gives every face a colour, the axis faces their axis colour', () => {
    const faces = solidScriptNormalPickFaces();
    const x = faces.find((face) => face.direction.lines[0] === '+X');
    const y = faces.find((face) => face.direction.lines[0] === '+Y');
    expect(x?.color.getHex()).not.toBe(y?.color.getHex());
    expect(new Set(faces.map((face) => face.color.getHex())).size).toBeGreaterThan(6);
  });
});

describe('Direction fields', () => {
  it('are every vector field that takes a normal, direction or axis', () => {
    for (const [id, key] of [
      ['clip', 'normal'],
      ['mirror', 'v'],
      ['align', 'direction'],
      ['path', 'normal'],
      ['place_at_points', 'directions'],
      ['find_on', 'direction'],
      ['project_uvs', 'axis'],
      ['widget_slider', 'along'],
      ['sweep_along_path', 'up'],
    ] as const)
      expect(solidScriptParameterTakesDirection(field(id, key)), `${id}.${key}`).toBe(true);
    for (const [id, key] of [
      ['scale_to', 'to'],
      ['resize', 'size'],
      ['project_uvs', 'center'],
      ['path', 'center'],
      ['find_on', 'normal'],
      ['prism', 'axis'],
    ] as const)
      expect(solidScriptParameterTakesDirection(field(id, key)), `${id}.${key}`).toBe(false);
  });

  it('offer Pick Normal… outside brackets only', () => {
    const scope = { names: [], extra: [], words: [], direction: true };
    expect(solidScriptSuggestionActions('0, 1, 0', 7, scope).map((entry) => entry.label)).toEqual(['Pick Normal…']);
    expect(solidScriptSuggestionActions('', 0, scope).map((entry) => entry.label)).toEqual(['Pick Normal…']);
    expect(solidScriptSuggestionActions('[=Vector(', 9, scope)).toEqual([]);
    expect(solidScriptSuggestionActions('0, 1, 0', 7, { ...scope, direction: false })).toEqual([]);
  });
});
