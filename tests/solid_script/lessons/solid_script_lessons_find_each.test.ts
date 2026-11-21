import { describe, expect, it } from 'vitest';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentFlowEnd } from '@/solid_script/document/solid_script_document_flow.js';

/**
 * Kinds a name may hold after the last line, as the editor works them out.
 *
 * @param lines Script lines.
 * @param name Variable name.
 * @returns Kinds, sorted.
 */
function kindsEnd(lines: SolidScriptLine[], name: string): string[] {
  const variable = solidScriptDocumentFlowEnd(solidScriptDocumentCreate(lines)).get(name);
  return [...(variable?.kinds ?? [])].sort();
}

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** A 4 by 1 by 4 slab whose top is at Y 0.5, with every face picked. */
const SLAB = [line('cube', { size: '4, 1, 4' }), line('select_objects'), line('select_faces', { which: 'All' })];

/**
 * Runs lines and returns what Echo printed, or the stop.
 *
 * @param lines Script lines.
 * @returns Printed messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  return result.error ? [result.error.message] : result.messages;
}

describe('Find On per item', () => {
  it('casts one ray per point of a list in From and writes lists, one entry per point', () => {
    expect(
      printed(
        ...SLAB,
        line('find_on', {
          how: 'Along Ray',
          from: '[1, 5, 0], [9, 5, 0], [-1, 5, 1]',
          direction: '0, -1, 0',
          into: 'Spots',
          distance: 'Far',
          normal: 'Ups',
          face: 'Hits',
          hit: 'Found',
        }),
        line('echo', { value: '[Spots]|[Far]|[Ups.First]|[Found]|[Hits.Count]' }),
      ),
    ).toEqual(['[[1, 0.5, 0], [0, 0, 0], [-1, 0.5, 1]]|[4.5, 0, 4.5]|[0, 1, 0]|[Yes, No, Yes]|2']);
  });

  it('takes a list of directions with one From, and finds the closest point per point', () => {
    expect(
      printed(
        ...SLAB,
        line('find_on', { how: 'Along Ray', from: '0, 0, 0', direction: '[1, 0, 0], [0, 1, 0]', distance: 'Far' }),
        line('find_on', { from: '[0, 3, 0], [5, 0, 0]', into: 'Near' }),
        line('echo', { value: '[Far]|[Near]' }),
      ),
    ).toEqual(['[2, 0.5]|[[0, 0.5, 0], [2, 0, 0]]']);
  });

  it('stops on lists of different lengths', () => {
    expect(
      printed(
        ...SLAB,
        line('find_on', {
          how: 'Along Ray',
          from: '[0, 5, 0], [1, 5, 0]',
          direction: '[0, -1, 0], [0, -1, 0], [0, -1, 0]',
        }),
      )[0],
    ).toMatch(/same number/);
  });

  it('tells the editor the results are lists when From is a list', () => {
    const lines = [
      ...SLAB,
      line('find_on', { from: '[0, 3, 0], [5, 0, 0]', into: 'Near', hit: 'Found' }),
      line('find_on', { from: '0, 3, 0', into: 'One' }),
    ];
    expect(kindsEnd(lines, 'near')).toEqual(['Vector List']);
    expect(kindsEnd(lines, 'found')).toEqual(['Yes/No List']);
    expect(kindsEnd(lines, 'one')).toEqual(['Vector']);
  });
});

describe('Find On per item, from a variable', () => {
  it('treats a variable of points as a list even with one point, and one written vector as one find', () => {
    expect(
      printed(
        ...SLAB,
        line('variable', { name: 'Spots', value: '[=List(Vector(0, 5, 0))]' }),
        line('find_on', { how: 'Along Ray', from: '[Spots]', direction: '0, -1, 0', distance: 'Far' }),
        line('find_on', { how: 'Along Ray', from: '[0, 5, 0]', direction: '0, -1, 0', distance: 'One' }),
        line('echo', { value: '[Far]|[One]' }),
      ),
    ).toEqual(['[4.5]|4.5']);
  });
});
