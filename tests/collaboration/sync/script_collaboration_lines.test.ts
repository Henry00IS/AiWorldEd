import { describe, expect, it } from 'vitest';
import type { NodeCollaborationState } from '@/collaboration/scene/node_collaboration_types.js';
import {
  scriptCollaborationLinesApply,
  scriptCollaborationLinesDiff,
  scriptCollaborationLinesKeys,
  scriptCollaborationLinesParse,
} from '@/collaboration/sync/script_collaboration_lines.js';

const PATH = 'data.entry.modifierStack.modifiers';

/**
 * Builds a node state holding one script modifier.
 *
 * @param lines Line ids with their command.
 * @param extra Other parameters of the modifier.
 * @returns State.
 */
function state(lines: [string, string][], extra: Record<string, unknown> = {}): NodeCollaborationState {
  const blocks = lines.map(([id, command]) => ({ id, command, values: {} }));
  const step = { id: 's', kind: 'solid_script', parameters: { script: { version: 1, name: '', blocks }, ...extra } };
  return {
    id: 'n',
    kind: 'entry',
    parent: '',
    key: 'a',
    data: { entry: { modifierStack: { modifiers: [step] } } },
  } as unknown as NodeCollaborationState;
}

/**
 * Reads the line ids and commands of a state.
 *
 * @param value State.
 * @returns `id:command` per line.
 */
function read(value: NodeCollaborationState): string[] {
  const data = value.data as unknown as {
    entry: {
      modifierStack: { modifiers: { parameters: { script: { blocks: { id: string; command: string }[] } } }[] };
    };
  };
  return data.entry.modifierStack.modifiers[0]!.parameters.script.blocks.map((block) => `${block.id}:${block.command}`);
}

describe('script lines in collaboration', () => {
  const base = state([
    ['a', 'cube'],
    ['b', 'sphere'],
    ['c', 'cone'],
  ]);

  it('names the lines a script edit sets and removes, and nothing for other changes', () => {
    const after = state([
      ['a', 'cube'],
      ['x', 'torus'],
      ['b', 'pipe'],
    ]);
    expect(scriptCollaborationLinesDiff(base, after, [PATH])).toEqual({
      path: PATH,
      steps: { s: { set: ['x', 'b'], gone: ['c'] } },
    });
    expect(scriptCollaborationLinesDiff(base, state([['a', 'cube']], { inputs: { w: '1' } }), [PATH])).toBeNull();
    expect(scriptCollaborationLinesDiff(base, base, ['data.entry.name'])).toBeNull();
  });

  it('writes only the named lines over another user’s lines and keeps own lines that are not sent yet', () => {
    const mine = state([
      ['a', 'cylinder'],
      ['b', 'sphere'],
      ['c', 'cone'],
    ]);
    const theirs = state([
      ['a', 'cube'],
      ['b', 'sphere'],
      ['c', 'prism'],
      ['y', 'torus'],
    ]);
    const lines = scriptCollaborationLinesDiff(base, theirs, [PATH])!;
    expect(read(scriptCollaborationLinesApply(mine, theirs, lines))).toEqual([
      'a:cylinder',
      'b:sphere',
      'c:prism',
      'y:torus',
    ]);
    expect(read(scriptCollaborationLinesApply(mine, theirs, lines, new Set(['s:c'])))).toEqual([
      'a:cylinder',
      'b:sphere',
      'c:cone',
      'y:torus',
    ]);
    expect(scriptCollaborationLinesKeys(lines)).toEqual(['s:c', 's:y']);
    expect(read(mine)).toEqual(['a:cylinder', 'b:sphere', 'c:cone']);
  });

  it('moves a line after the line before it, and refuses malformed or oversized line lists', () => {
    const moved = state([
      ['b', 'sphere'],
      ['a', 'cube'],
      ['c', 'cone'],
    ]);
    const lines = scriptCollaborationLinesDiff(base, moved, [PATH])!;
    expect(read(scriptCollaborationLinesApply(base, moved, lines))).toEqual(['b:sphere', 'a:cube', 'c:cone']);
    expect(scriptCollaborationLinesParse(JSON.parse(JSON.stringify(lines)))).toEqual(lines);
    expect(scriptCollaborationLinesParse({ path: 'data.entry.name', steps: {} })).toBeNull();
    expect(scriptCollaborationLinesParse({ path: PATH, steps: { s: { set: [1], gone: [] } } })).toBeNull();
    const many = Array.from({ length: 3000 }, (_, index) => `l${index}`);
    expect(scriptCollaborationLinesParse({ path: PATH, steps: { s: { set: many, gone: [] } } })).toBeNull();
  });
});
