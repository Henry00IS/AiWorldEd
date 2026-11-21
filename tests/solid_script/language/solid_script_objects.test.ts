import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptKindAccepted, solidScriptKindOf } from '@/solid_script/language/solid_script_kinds.js';
import { solidScriptMemberNames, solidScriptMemberType } from '@/solid_script/language/solid_script_members.js';
import { SolidScriptElement, solidScriptValueType } from '@/solid_script/language/solid_script_value.js';

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/**
 * A Solid and a Mesh as value handles, used to check their shared and specific
 * kinds without building unrelated geometry.
 *
 * @returns One Solid and one Mesh.
 */
function objects(): [SolidScriptElement, SolidScriptElement] {
  const solid = new SolidScriptElement('brush', 1);
  const mesh = new SolidScriptElement('brush', 2);
  mesh.mesh = true;
  return [solid, mesh];
}

describe('objects contain solids and meshes but not flat paths', () => {
  it('names a Solid or Mesh precisely, and a mixed list Object List', () => {
    const [solid, mesh] = objects();
    expect(solidScriptKindOf(solid)).toBe('Solid');
    expect(solidScriptKindOf(mesh)).toBe('Mesh');
    expect(solidScriptKindOf([solid, mesh])).toBe('Object List');
    expect(solidScriptValueType([solid, mesh])).toBe('Object List');
    expect(solidScriptValueType([mesh])).toBe('Mesh List');
    expect(solidScriptKindAccepted(['Object'], 'Solid')).toBe(true);
    expect(solidScriptKindAccepted(['Object'], 'Mesh')).toBe(true);
    expect(solidScriptKindAccepted(['Object'], 'Outline')).toBe(false);
    expect(solidScriptKindAccepted(['Solid'], 'Mesh')).toBe(false);
  });
  it('offers typed Solids and Meshes filters and the shared geometry members', () => {
    for (const type of ['Object List', 'Solid List', 'Mesh List']) {
      expect(solidScriptMemberNames(type)).toEqual(expect.arrayContaining(['Solids', 'Meshes', 'Faces', 'Size']));
      expect(solidScriptMemberType(type, 'Solids')).toBe('Solid List');
      expect(solidScriptMemberType(type, 'Meshes')).toBe('Mesh List');
    }
    expect(solidScriptMemberType('Solid', 'Mode')).toBe('Text');
    expect(solidScriptMemberType('Mesh', 'Mode')).toBeNull();
  });
  it('Select Objects picks both, with filters and no old member alias', () => {
    const run = solidScriptProgramRun(
      solidScriptDocumentCreate([
        line('cube'),
        line('mesh'),
        line('vertex', { position: '0, 0, 0' }),
        line('vertex', { position: '1, 0, 0' }),
        line('vertex', { position: '0, 1, 0' }),
        line('face', { vertices: '0, 1, 2' }),
        line('end'),
        line('select_objects'),
        line('echo', {
          value: '[$Selected.Objects.Count], [$Selected.Objects.Solids.Count], [$Selected.Objects.Meshes.Count]',
        }),
        line('echo', {
          value:
            '[=IsSolid([$Selected.Objects.First])], [=IsObject([$Selected.Objects.Last])], [=IsSolid([$Selected.Objects.Last])]',
        }),
      ]),
      {},
    );
    expect(run.error?.text ?? '').toBe('');
    expect(run.messages).toEqual(['2, 1, 1', 'Yes, Yes, No']);
  });
});
