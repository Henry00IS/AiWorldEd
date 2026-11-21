import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptMemberNames, solidScriptMemberType } from '@/solid_script/language/solid_script_members.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptSolidTreeBuild,
  type SolidScriptSolidTreeOptions,
} from '@/solid_script/language/solid_script_solid_tree.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import type { SolidScriptMode } from '@/solid_script/language/solid_script_mode.js';
import { solidScriptUseSolidOf } from './solid_script_use_solid.js';

const END: SolidScriptLine = { command: 'end' };

const TREE: SolidScriptSolidTreeOptions = {
  offset: new THREE.Vector3(),
  worldToParent: new THREE.Matrix4(),
  operation: SolidOperation.Additive,
  namePrefix: '',
};

const line = (command: string, values: Record<string, string> = {}): SolidScriptLine => ({ command, values });

/** Corners of a 1 m cube centered at the origin. */
function cubeCorners(): [number, number, number][] {
  const corners: [number, number, number][] = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) corners.push([x, y, z]);
  return corners;
}

/**
 * Runs lines and returns the result, leaving Mode unset when the line did not
 * set it so inheritance can be tested.
 *
 * @param lines Lines.
 * @param use Use facts of the run.
 * @returns Run.
 */
function run(lines: SolidScriptLine[], use?: SolidScriptUseFacts) {
  const document = solidScriptDocumentCreate(lines);
  return solidScriptProgramRun(document, use ? { use } : {});
}

/** A generator run whose empty Mode inherits Subtractive. */
const SUBTRACTIVE_INSERT: SolidScriptUseFacts = {
  usage: 'Generator',
  solids: [],
  faces: 0,
  mode: 'Subtractive',
  insertMode: 'Subtractive',
};

describe('Brush.Mode', () => {
  it('is a Text member of a brush, not of a mesh', () => {
    expect(solidScriptMemberType('Object', 'Mode')).toBe('Text');
    expect(solidScriptMemberType('Object List', 'Modes')).toBe('Text List');
    expect(solidScriptMemberNames('Object')).toContain('Mode');
    expect(solidScriptMemberType('Mesh', 'Mode')).toBeNull();
    expect(solidScriptMemberNames('Mesh')).not.toContain('Mode');
  });

  it.each(['Additive', 'Subtractive', 'Intersecting'] as const)(
    'reads an explicit %s Mode on a built brush',
    (mode) => {
      const result = run([line('cube', { mode, into: 'Box' }), line('echo', { value: '[Box.Mode]' })]);
      expect(result.error?.message ?? null).toBeNull();
      expect(result.messages).toEqual([mode]);
    },
  );

  it('reads the inherited insertion Mode when Mode was left empty', () => {
    const result = run(
      [line('cube', { mode: '', into: 'Box' }), line('echo', { value: '[Box.Mode]' })],
      SUBTRACTIVE_INSERT,
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['Subtractive']);
  });

  it('reads Additive for an empty Mode inside a Group or a nested Group', () => {
    const result = run(
      [
        line('group', { mode: 'Subtractive' }),
        line('group', { mode: 'Intersecting' }),
        line('cube', { mode: '', into: 'Inner' }),
        END,
        line('cube', { mode: '', into: 'Outer' }),
        END,
        line('echo', { value: '[Inner.Mode]' }),
        line('echo', { value: '[Outer.Mode]' }),
        line('cube', { mode: '', into: 'Top' }),
        line('echo', { value: '[Top.Mode]' }),
      ],
      SUBTRACTIVE_INSERT,
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['Additive', 'Additive', 'Subtractive']);
  });

  it('keeps an explicit Mode inside a Group', () => {
    const result = run(
      [
        line('group', { mode: 'Subtractive' }),
        line('cube', { mode: 'Intersecting', into: 'Box' }),
        END,
        line('echo', { value: '[Box.Mode]' }),
      ],
      SUBTRACTIVE_INSERT,
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['Intersecting']);
  });

  it.each(['Additive', 'Subtractive', 'Intersecting'] as const)(
    'lets Set change a built brush to %s and the tree uses that Mode',
    (mode) => {
      const result = run([
        line('cube', { mode: 'Additive', into: 'Box' }),
        line('variable', { name: 'Box.Mode', value: mode }),
        line('echo', { value: '[Box.Mode]' }),
        line('output', { of: '[Box]' }),
      ]);
      expect(result.error?.message ?? null).toBeNull();
      expect(result.messages).toEqual([mode]);
      const [node] = solidScriptSolidTreeBuild(result.shapes, TREE);
      const expected =
        mode === 'Subtractive'
          ? SolidOperation.Subtractive
          : mode === 'Intersecting'
            ? SolidOperation.Intersecting
            : SolidOperation.Additive;
      expect(node && node.kind === 'brush' ? node.operation : null).toBe(expected);
    },
  );

  it('lets Set change an inherited empty Mode, including on $Selected.Objects', () => {
    const result = run(
      [
        line('cube', { mode: '', into: 'Box' }),
        line('select_objects', { which: 'All', of: '[Box]' }),
        line('variable', { name: '$Selected.Objects.Modes', value: 'Intersecting' }),
        line('echo', { value: '[Box.Mode]' }),
      ],
      SUBTRACTIVE_INSERT,
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['Intersecting']);
  });

  it('stops Set on an invalid Mode with the official words', () => {
    const result = run([
      line('cube', { mode: 'Additive', into: 'Box' }),
      line('variable', { name: 'Box.Mode', value: 'Pass-Through' }),
    ]);
    expect(result.error?.message ?? '').toMatch(
      /Mode must be Additive, Subtractive or Intersecting, not "Pass-Through"/,
    );
  });

  it('stops Set when Mode is empty', () => {
    const result = run([
      line('cube', { mode: 'Additive', into: 'Box' }),
      line('variable', { name: 'Box.Mode', value: '' }),
    ]);
    expect(result.error?.message ?? '').toMatch(/Mode must be Additive, Subtractive or Intersecting, not ""/);
  });
});

describe('Input Objects.Mode', () => {
  const modes: SolidScriptMode[] = ['Additive', 'Subtractive', 'Intersecting'];
  const inputUse = (words: readonly SolidScriptMode[]): SolidScriptUseFacts => ({
    usage: 'Modifier',
    solids: words.map(() => solidScriptUseSolidOf(cubeCorners())),
    modes: words,
    faces: words.length * 6,
    insertMode: 'Additive',
    mode: 'Subtractive',
  });

  it('reads every received brush Mode and Filter List can keep one Mode', () => {
    const result = run(
      [
        line('echo', { value: '[$Input.Objects.Modes]' }),
        line('filter_list', { list: '[$Input.Objects]', where: '[=[$Item.Mode] == "Subtractive"]', into: 'Cut' }),
        line('echo', { value: '[Cut.Count]' }),
        line('echo', { value: '[Cut.First.Mode]' }),
        line('input_objects'),
      ],
      inputUse(modes),
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages[0]).toBe('[Additive, Subtractive, Intersecting]');
    expect(result.messages[1]).toBe('1');
    expect(result.messages[2]).toBe('Subtractive');
    const ops = solidScriptSolidTreeBuild(result.shapes, TREE).map((node) =>
      node.kind === 'brush' ? node.operation : null,
    );
    expect(ops).toEqual([SolidOperation.Additive, SolidOperation.Subtractive, SolidOperation.Intersecting]);
  });

  it.each(modes)('lets Set change a received brush to %s', (mode) => {
    const result = run(
      [
        line('input_objects', { into: 'Got' }),
        line('variable', { name: 'Got.Modes', value: mode }),
        line('output', { of: '[Got]' }),
        line('echo', { value: '[Got.Modes]' }),
      ],
      inputUse(['Additive', 'Subtractive', 'Intersecting']),
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual([`[${mode}, ${mode}, ${mode}]`]);
    const received = result.shapes.filter((shape) => shape.kind === 'solid' && shape.received);
    expect(received).toHaveLength(3);
    expect(received.map((shape) => (shape.kind === 'solid' ? shape.mode : undefined))).toEqual([mode, mode, mode]);
  });

  it('keeps the pass record when Set changes one received Mode', () => {
    const result = run(
      [
        line('input_objects', { into: 'Got' }),
        line('variable', { name: 'Got(0).Mode', value: 'Subtractive' }),
        line('variable', { name: 'Got(1).Mode', value: 'Intersecting' }),
        line('variable', { name: 'Got(2).Mode', value: 'Additive' }),
        line('output', { of: '[Got]' }),
        line('echo', { value: '[Got.Modes]' }),
      ],
      inputUse(['Additive', 'Subtractive', 'Intersecting']),
    );
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['[Subtractive, Intersecting, Additive]']);
    const received = result.shapes.filter((shape) => shape.kind === 'solid' && shape.received);
    expect(received.map((shape) => (shape.kind === 'solid' ? shape.mode : undefined))).toEqual([
      'Subtractive',
      'Intersecting',
      'Additive',
    ]);
  });

  it('treats a received brush without a Mode as Additive at the top level', () => {
    const result = run([line('input_objects', { into: 'Got' }), line('echo', { value: '[Got.First.Mode]' })], {
      usage: 'Modifier',
      solids: [solidScriptUseSolidOf(cubeCorners())],
      faces: 6,
      mode: 'Subtractive',
    });
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['Additive']);
  });
});

describe('Brush.Mode performance', () => {
  it('reads Modes of 10,000 received brushes', () => {
    const count = 10_000;
    const corners = cubeCorners();
    const words: SolidScriptMode[] = Array.from({ length: count }, (_, index) =>
      index % 3 === 0 ? 'Additive' : index % 3 === 1 ? 'Subtractive' : 'Intersecting',
    );
    const started = performance.now();
    const result = run(
      [
        line('echo', { value: '[$Input.Objects.Count]' }),
        line('filter_list', { list: '[$Input.Objects]', where: '[=[$Item.Mode] == "Subtractive"]', into: 'Cut' }),
        line('echo', { value: '[Cut.Count]' }),
        line('input_objects'),
      ],
      { usage: 'Modifier', solids: words.map(() => solidScriptUseSolidOf(corners)), modes: words, faces: count * 6 },
    );
    const elapsed = performance.now() - started;
    expect(result.error?.message ?? null).toBeNull();
    expect(result.messages).toEqual(['10000', '3333']);
    expect(elapsed).toBeLessThan(15_000);
  }, 20_000);
});
