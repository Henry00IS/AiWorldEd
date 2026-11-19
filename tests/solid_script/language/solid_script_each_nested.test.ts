import { describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';

const END: SolidScriptLine = { command: 'end' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Messages, or throws the run error.
 */
function messages(...lines: SolidScriptLine[]): string[] {
  const result = solidScriptProgramRun(solidScriptDocumentCreate(lines));
  if (result.error) throw new Error(result.error.message);
  return result.messages;
}

describe('SolidScript nested current elements', () => {
  it('uses the innermost $Face, and a Set keeps the outer one', () => {
    const lines: SolidScriptLine[] = [
      { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
      { command: 'select_faces', values: { which: 'All', into: 'Faces' } },
      { command: 'for_each', values: { variable: 'Outer', list: '[Faces]' } },
      { command: 'variable', values: { name: 'Kept', value: '[$Face]' } },
      { command: 'for_each', values: { variable: 'Inner', list: '[Faces]' } },
      { command: 'echo', values: { value: '[$Face.Center] kept [Kept.Center]' } },
      END,
      END,
    ];
    const printed = messages(...lines);
    expect(printed).toHaveLength(36);
    const same = printed.filter((message) => {
      const [inner, kept] = message.split(' kept ');
      return inner === kept;
    });
    expect(same).toHaveLength(6);
    expect(printed.length - same.length).toBe(30);
  });
});
