import { describe, expect, it } from 'vitest';
import { solidScriptNameWritesMember } from '@/solid_script/language/solid_script_name_writes_member.js';

describe('solidScriptNameWritesMember', () => {
  it('tells names that may write a member of an element', () => {
    for (const name of [
      'Face.Data.Height',
      'Faces.UVs',
      'FaceCorner.UV',
      'Vertex.Position',
      'Vertices.Positions.Y',
      'Solid.Mode',
      '$Local.UVs',
    ])
      expect(solidScriptNameWritesMember(name), name).toBe(true);
  });

  it('tells plain and Local names that cannot', () => {
    for (const name of ['Height', '$Local.AB', '$Local.Data', 'Box.Size.X', 'Ring(1).Point'])
      expect(solidScriptNameWritesMember(name), name).toBe(false);
  });

  it('gives the same answer when asked again', () => {
    expect(solidScriptNameWritesMember('$Local.Next')).toBe(false);
    expect(solidScriptNameWritesMember('$Local.Next')).toBe(false);
    expect(solidScriptNameWritesMember('Face.Data.Next')).toBe(true);
  });
});
