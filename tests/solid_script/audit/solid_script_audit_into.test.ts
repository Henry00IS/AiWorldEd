import { describe, expect, it } from 'vitest';
import { solidScriptCommands } from '@/solid_script/commands/solid_script_command_catalog.js';
import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';

/** Kinds an Into field may hold when it is a brush or mesh copy. */
const COPY_KINDS = new Set(['Object', 'Solid', 'Mesh', 'Object List', 'Solid List', 'Mesh List']);

/** Kinds an Into field must label, never copy. */
const LABEL_KINDS = new Set([
  'Face',
  'Face List',
  'Edge',
  'Edge List',
  'Vertex',
  'Vertex List',
  'Vector',
  'Vector List',
  'Number',
  'Yes/No',
  'List',
]);

/**
 * Whether a field is an Into-style name: it writes a fixed kind to a variable,
 * and is optional or the command's Into field.
 *
 * @param parameter Field.
 * @returns True when the field must be classified.
 */
function intoStyle(parameter: SolidScriptCommandParameter): boolean {
  const gives = parameter.writes?.gives;
  if (gives?.rule !== 'kind') return false;
  if (parameter.type !== 'name') return false;
  return parameter.optional === true || parameter.key === 'into';
}

/**
 * Kind a classified field writes, or empty when it has no fixed kind.
 *
 * @param parameter Field.
 * @returns Kind text.
 */
function kindOf(parameter: SolidScriptCommandParameter): string {
  const gives = parameter.writes?.gives;
  return gives?.rule === 'kind' ? gives.kind : '';
}

describe('every Into-style field is classified as copy or label', () => {
  const fields = solidScriptCommands.flatMap((command) =>
    command.parameters.map((parameter) => [`${command.id}.${parameter.key}`, parameter] as const),
  );

  it('classifies every Into-style field', () => {
    const missed = fields
      .filter(([, parameter]) => intoStyle(parameter))
      .filter(([, parameter]) => parameter.into !== 'copy' && parameter.into !== 'label')
      .map(([name, parameter]) => `${name} (${kindOf(parameter)})`);
    expect(missed).toEqual([]);
  });

  it('does not classify fields that are not Into-style', () => {
    const extra = fields
      .filter(([, parameter]) => parameter.into === 'copy' || parameter.into === 'label')
      .filter(([, parameter]) => !intoStyle(parameter))
      .map(([name]) => name);
    expect(extra).toEqual([]);
  });

  it('marks only brush or mesh results as copy', () => {
    const wrong = fields
      .filter(([, parameter]) => parameter.into === 'copy')
      .filter(([, parameter]) => !COPY_KINDS.has(kindOf(parameter)))
      .map(([name, parameter]) => `${name} (${kindOf(parameter)})`);
    expect(wrong).toEqual([]);
  });

  it('marks face, edge, point and other non-shape results as label', () => {
    const wrong = fields
      .filter(([, parameter]) => LABEL_KINDS.has(kindOf(parameter)))
      .filter(([, parameter]) => intoStyle(parameter) && parameter.into !== 'label')
      .map(([name, parameter]) => `${name} (${kindOf(parameter)} is ${parameter.into})`);
    expect(wrong).toEqual([]);
  });
});
