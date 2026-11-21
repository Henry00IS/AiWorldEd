import { describe, expect, it } from 'vitest';
import {
  solidScriptNameDotProblem,
  solidScriptNameIsDataWrite,
  solidScriptNameIsPositionWrite,
  solidScriptNameIsUvWrite,
} from '@/solid_script/language/solid_script_name_rules.js';

describe('SolidScript name rules for values under .Data', () => {
  it('tells a name that sets a value under .Data, also through members and items', () => {
    for (const name of [
      'Face.Data.Height',
      'Object.Edges.Data.Kind',
      'Object.Faces(0).Edges.Data.Kind',
      'Edge.Parent.Data.Kind',
      'Sides(0).Data.[Key]',
    ])
      expect(solidScriptNameIsDataWrite(name), name).toBe(true);
    for (const name of ['Width', 'Pos.x', 'Object.Edges', 'Object.Edges.Data', 'Data.Kind'])
      expect(solidScriptNameIsDataWrite(name), name).toBe(false);
  });

  it('lets a line set Data through members, but not the members themselves', () => {
    expect(solidScriptNameDotProblem('Object.Edges.Data.Kind', 'set')).toBe('');
    expect(solidScriptNameDotProblem('Object.Faces(0).Edges.Data.[Key]', 'set')).toBe('');
    expect(solidScriptNameDotProblem('Object.Edges', 'set')).toMatch(/^Object\.Edges can only be read/);
    expect(solidScriptNameDotProblem('Face.Center', 'set')).toMatch(/^Face\.Center can only be read/);
  });

  it('lets a line set Face.UVs, also through a list of faces', () => {
    expect(solidScriptNameIsUvWrite('Face.UVs')).toBe(true);
    expect(solidScriptNameIsUvWrite('Object.Faces.UVs')).toBe(true);
    expect(solidScriptNameIsUvWrite('Sides.UVs')).toBe(true);
    expect(solidScriptNameIsUvWrite('Face.Normal')).toBe(false);
    expect(solidScriptNameDotProblem('Face.UVs', 'set')).toBe('');
    expect(solidScriptNameDotProblem('Object.Faces.UVs', 'set')).toBe('');
  });

  it('lets a line set Vertex.Position, list Positions, and an axis, including $Selected', () => {
    for (const name of [
      'Vertex.Position',
      'Vertices.Positions',
      'Vertex.Position.Y',
      '$Selected.Vertices.Positions',
      '$Selected.Vertices.Positions.X',
      'Object.Vertices.Positions',
      '$Vertex.Position',
    ])
      expect(solidScriptNameIsPositionWrite(name), name).toBe(true);
    for (const name of ['Face.Center', 'Vertex.Normal', 'Pos.X', '$Selected.Vertices'])
      expect(solidScriptNameIsPositionWrite(name), name).toBe(false);
    expect(solidScriptNameDotProblem('Vertex.Position', 'set')).toBe('');
    expect(solidScriptNameDotProblem('$Selected.Vertices.Positions', 'set')).toBe('');
    expect(solidScriptNameDotProblem('Face.Center', 'set')).toMatch(/^Face\.Center can only be read/);
  });

  it('asks for a key when a line sets .Data itself', () => {
    expect(solidScriptNameDotProblem('Object.Edges.Data', 'set')).toMatch(
      /^Object\.Edges\.Data needs a key to set, such as Object\.Edges\.Data\.Height/,
    );
  });
});
