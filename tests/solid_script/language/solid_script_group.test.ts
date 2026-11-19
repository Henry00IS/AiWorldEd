import { describe, expect, it } from 'vitest';
import { solidScriptCommandFind } from '@/solid_script/commands/solid_script_command_catalog.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramEvaluate, solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_GROUP_MODE_WORDS } from '@/solid_script/language/solid_script_mode.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';

/**
 * Builds a script from lines.
 *
 * @param lines Lines.
 * @returns Script.
 */
function script(...lines: SolidScriptLine[]) {
  return solidScriptDocumentCreate(lines);
}

/**
 * Names a shape and its Mode for assertions.
 *
 * @param shape Shape.
 * @returns Summary.
 */
function named(shape: SolidScriptShape): unknown {
  if (shape.kind === 'group') return [shape.label, 'group', shape.mode, shape.children.map(named)];
  if (shape.kind === 'solid') return [shape.label, 'solid', shape.mode ?? 'Additive'];
  return [shape.label, shape.kind];
}

describe('SolidScript Part and Group', () => {
  it('gives Group and Define Part the editor Mode words, including Pass-Through', () => {
    const words = SOLID_SCRIPT_GROUP_MODE_WORDS.map((entry) => entry.word);
    expect(words).toEqual(['Additive', 'Subtractive', 'Intersecting', 'Pass-Through']);
    for (const id of ['group', 'part']) {
      const command = solidScriptCommandFind(id);
      if (!command) throw new Error(`${id} is missing`);
      const mode = command.parameters.find((parameter) => parameter.key === 'mode');
      expect(
        mode?.words?.map((entry) => entry.word),
        id,
      ).toEqual(words);
    }
  });

  it('builds a Part into a variable of the same name and outputs nothing where it stands', () => {
    const result = solidScriptProgramRun(
      script(
        { command: 'part', values: { name: 'Wall' } },
        { command: 'cube', values: { size: '4, 3, 0.2', anchor: 'Center, Center, Center' } },
        { command: 'end' },
        { command: 'echo', values: { value: '[Wall]' } },
      ),
    );
    expect(result.error).toBeNull();
    expect(result.shapes).toEqual([]);
    expect(result.messages).toEqual(['[Wall]']);
  });

  it('stamps a Part with Output, including its group and Mode', () => {
    const { shapes } = solidScriptProgramEvaluate(
      script(
        { command: 'part', values: { name: 'Post', mode: 'Subtractive' } },
        { command: 'cube', values: { size: '0.4, 3, 0.4', anchor: 'Center, Center, Center' } },
        { command: 'end' },
        { command: 'output', values: { of: '[Post]' } },
      ),
    );
    expect(shapes.map(named)).toEqual([['Post', 'group', 'Subtractive', [['Post', 'solid', 'Additive']]]]);
  });

  it('stops Output when the Part line has not run yet', () => {
    const result = solidScriptProgramRun(
      script(
        { command: 'output', values: { of: '[Post]' } },
        { command: 'part', values: { name: 'Post' } },
        { command: 'cube', values: { size: '0.4, 3, 0.4', anchor: 'Center, Center, Center' } },
        { command: 'end' },
      ),
    );
    expect(result.error?.message).toMatch(/no variable \[Post\]/);
  });

  it('leaves already stamped copies unchanged when it stamps again', () => {
    const { shapes } = solidScriptProgramEvaluate(
      script(
        { command: 'part', values: { name: 'Post' } },
        { command: 'cube', values: { size: '0.4, 3, 0.4', anchor: 'Center, Center, Center' } },
        { command: 'end' },
        { command: 'output', values: { of: '[Post]' } },
        { command: 'output', values: { of: '[Post]' } },
      ),
    );
    expect(shapes).toHaveLength(2);
    const first = shapes[0];
    const second = shapes[1];
    if (first?.kind !== 'group' || second?.kind !== 'group') throw new Error('expected groups');
    const left = first.children[0];
    const right = second.children[0];
    if (left?.kind !== 'solid' || right?.kind !== 'solid') throw new Error('expected solids');
    const original = right.points[0]?.clone();
    if (!left.points[0] || !original) throw new Error('expected corners');
    left.points[0].x += 10;
    expect(right.points[0]?.toArray()).toEqual(original.toArray());
  });

  it('lets a later line read the Part as a brush, and shares the name with variables', () => {
    const result = solidScriptProgramRun(
      script(
        { command: 'part', values: { name: 'Post' } },
        { command: 'cube', values: { size: '0.4, 3, 0.4', anchor: 'Center, Center, Center' } },
        { command: 'end' },
        { command: 'variable', values: { name: 'Held', value: '[Post]' } },
        { command: 'echo', values: { value: '[Held]' } },
      ),
    );
    expect(result.error).toBeNull();
    expect(result.messages).toEqual(['[Post]']);
  });

  it('wraps Group children in a CSG group with the chosen Mode', () => {
    const { shapes } = solidScriptProgramEvaluate(
      script(
        { command: 'group', values: { mode: 'Intersecting' } },
        { command: 'cube', values: { anchor: 'Center, Center, Center' } },
        { command: 'sphere', values: { r: '1', mode: 'Subtractive' } },
        { command: 'end' },
      ),
    );
    expect(shapes.map(named)).toEqual([
      [
        'group',
        'group',
        'Intersecting',
        [
          ['cube', 'solid', 'Additive'],
          ['sphere', 'solid', 'Subtractive'],
        ],
      ],
    ]);
  });
});
