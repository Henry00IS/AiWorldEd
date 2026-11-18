import { describe, expect, it } from 'vitest';
import {
  solidScriptNameDotProblem,
  solidScriptNameIsDataWrite,
  solidScriptNameIsUvWrite,
} from '@/solid_script/language/solid_script_name_rules.js';

describe('SolidScript name rules for values under .Data', () => {
  it('tells a name that sets a value under .Data, also through members and items', () => {
    for (const name of [
      'Face.Data.Height',
      'Brush.Edges.Data.Kind',
      'Brush.Faces(0).Edges.Data.Kind',
      'Edge.Parent.Data.Kind',
      'Sides(0).Data.[Key]',
    ])
      expect(solidScriptNameIsDataWrite(name), name).toBe(true);
    for (const name of ['Width', 'Pos.x', 'Brush.Edges', 'Brush.Edges.Data', 'Data.Kind'])
      expect(solidScriptNameIsDataWrite(name), name).toBe(false);
  });

  it('lets a line set Data through members, but not the members themselves', () => {
    expect(solidScriptNameDotProblem('Brush.Edges.Data.Kind', 'set')).toBe('');
    expect(solidScriptNameDotProblem('Brush.Faces(0).Edges.Data.[Key]', 'set')).toBe('');
    expect(solidScriptNameDotProblem('Brush.Edges', 'set')).toMatch(/^Brush\.Edges can only be read/);
    expect(solidScriptNameDotProblem('Face.Center', 'set')).toMatch(/^Face\.Center can only be read/);
  });

  it('lets a line set Face.UVs, also through a list of faces', () => {
    expect(solidScriptNameIsUvWrite('Face.UVs')).toBe(true);
    expect(solidScriptNameIsUvWrite('Brush.Faces.UVs')).toBe(true);
    expect(solidScriptNameIsUvWrite('Sides.UVs')).toBe(true);
    expect(solidScriptNameIsUvWrite('Face.Normal')).toBe(false);
    expect(solidScriptNameDotProblem('Face.UVs', 'set')).toBe('');
    expect(solidScriptNameDotProblem('Brush.Faces.UVs', 'set')).toBe('');
  });

  it('asks for a key when a line sets .Data itself', () => {
    expect(solidScriptNameDotProblem('Brush.Edges.Data', 'set')).toMatch(
      /^Brush\.Edges\.Data needs a key to set, such as Brush\.Edges\.Data\.Height/,
    );
  });
});
