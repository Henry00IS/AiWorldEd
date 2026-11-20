import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind, solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentListing } from '@/solid_script/document/solid_script_document_listing.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { solidScriptMistakeCheck, solidScriptUseCheck } from '@/solid_script/language/solid_script_use_check.js';
import { solidScriptKindCheck } from '@/solid_script/document/solid_script_document_kind_check.js';

describe('SolidScript brush Mode', () => {
  it('defaults to Additive, hidden in the listing until it changes', () => {
    const command = solidScriptCommandFind('cube');
    if (!command) throw new Error('Cube is missing');
    expect(command.parameters.some((parameter) => parameter.key === 'mode')).toBe(true);
    expect(command.listingText({ size: '1, 1, 1' })).toBe("Cube '1, 1, 1'");
    expect(command.listingText({ size: '1, 1, 1', mode: 'Additive' })).toBe("Cube '1, 1, 1'");
    expect(command.listingText({ size: '1, 1, 1', mode: 'Subtractive' })).toBe("Cube '1, 1, 1' (Mode 'Subtractive')");
  });

  it('puts Subtractive and Intersecting on the built solids', () => {
    const { shapes } = solidScriptProgramEvaluate(
      solidScriptDocumentCreate([
        { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
        { command: 'sphere', values: { r: '1', anchor: 'Center, Center, Center', mode: 'Subtractive' } },
        { command: 'cylinder', values: { h: '1', r1: '1', r2: '1', mode: 'Intersecting' } },
      ]),
    );
    expect(shapes.map((shape) => (shape.kind === 'solid' ? (shape.mode ?? 'Additive') : shape.kind))).toEqual([
      'Additive',
      'Subtractive',
      'Intersecting',
    ]);
  });

  it('is on every brush generator and on no mesh command', () => {
    const generators = [
      'cube',
      'sphere',
      'cylinder',
      'polyhedron',
      'linear_extrude',
      'rotate_extrude',
      'hull',
      'minkowski',
    ];
    for (const id of generators) {
      const command = solidScriptCommandFind(id);
      if (!command) throw new Error(`${id} is missing`);
      expect(
        command.parameters.some((parameter) => parameter.key === 'mode'),
        id,
      ).toBe(true);
    }
    for (const command of solidScriptCommands) {
      if (command.category !== 'Meshes') continue;
      expect(
        command.parameters.some((parameter) => parameter.key === 'mode'),
        command.id,
      ).toBe(false);
    }
  });

  it('is gone as Union, Difference and Intersection blocks', () => {
    expect(solidScriptCommandFind('union')).toBeUndefined();
    expect(solidScriptCommandFind('difference')).toBeUndefined();
    expect(solidScriptCommandFind('intersection')).toBeUndefined();
    const listing = solidScriptDocumentListing(
      solidScriptDocumentCreate([
        { command: 'cube', values: { size: '2, 2, 2' } },
        { command: 'sphere', values: { r: '1.3', mode: 'Subtractive' } },
      ]),
    );
    expect(listing).toEqual(["Cube '2, 2, 2'", "Sphere Radius '1.3' (Mode 'Subtractive')"]);
  });
  it('does not warn when a Cube in a Subtractive group leaves Mode empty', () => {
    const document = solidScriptDocumentCreate([
      { command: 'group', values: { mode: 'Subtractive' } },
      { command: 'cube', values: { size: '2, 2, 2' } },
      { command: 'end', values: {} },
    ]);
    const texts = [
      ...solidScriptKindCheck(document),
      ...solidScriptUseCheck(document),
      ...solidScriptMistakeCheck(document),
    ].map((warning) => warning.text);
    expect(texts.filter((text) => /mode/i.test(text))).toEqual([]);
  });
});
