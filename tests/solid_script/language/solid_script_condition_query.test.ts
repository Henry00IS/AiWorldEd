import { describe, expect, it } from 'vitest';
import { SOLID_SCRIPT_CONDITION_HELPERS } from '@/solid_script/language/solid_script_condition_helpers.js';
import { SOLID_SCRIPT_FACING_WITHIN_DEFAULT } from '@/solid_script/language/solid_script_condition.js';
import {
  solidScriptQueryBody,
  solidScriptQueryChanged,
  solidScriptQueryCustomCreate,
  solidScriptQueryFieldFromFormula,
  solidScriptQueryFormulaFromField,
  solidScriptQueryFromField,
  solidScriptQueryGroupCreate,
  solidScriptQueryHelperCreate,
  solidScriptQueryHidden,
  solidScriptQueryInputHidden,
  solidScriptQueryRead,
  solidScriptQueryStore,
  solidScriptQueryText,
  solidScriptQueryTitle,
  solidScriptQueryToField,
  type SolidScriptQueryNode,
} from '@/solid_script/language/solid_script_condition_query.js';

/**
 * Marks a node and every group above it as dirty, the way easy mode does after
 * an edit.
 *
 * @param node Rows.
 * @returns Dirty copy.
 */
function dirtied(node: SolidScriptQueryNode): SolidScriptQueryNode {
  return { ...node, dirty: true };
}

describe('SolidScript query editor formula rows', () => {
  it('keeps a hand-typed formula exactly when easy mode does not edit it', () => {
    const texts = [
      '',
      'InBox([$Face.Center], Vector(0, 0, 0), 2)',
      'InBox([$Face.Center],Vector(0,0,0),2)',
      'facing([$Face.Normal], Vector(0, 1, 0))',
      'HasTag([$Face.Tags], Top)',
      'HasTag([$Face.Tags], "Top")',
      '[$Face.Area] > 1',
      'InBox([$Face.Center], Vector(0, 0, 0), 2) && Near([$Face.Center], [Spot], 1)',
      'A || B && C',
      '(A || B) && C',
      '!(InBox([$Face.Center], Vector(0, 0, 0), 2))',
      '!InBox([$Face.Center], Vector(0, 0, 0), 2)',
      'not InBox([$Face.Center], Vector(0, 0, 0), 2)',
      'Facing([$Face.Normal], Vector(0, 1, 0)) and InBox([$Face.Center], Vector(0, 0, 0), 2)',
      'InBox([$Face.Center], Vector(0, 0, 0), 2) or Near([$Face.Center], [Spot], 1)',
      'EveryNth([$Index], 2)',
      'EveryNth([$Index], 2, 1)',
      'Foo(1, 2)',
      'InBox([$Face.Center], Vector(0, 0, 0))',
      '[Flag]',
    ];
    for (const text of texts) expect(solidScriptQueryText(solidScriptQueryRead(text)), text).toBe(text);
  });

  it('writes formulas built in easy mode back as the same usual text', () => {
    const inbox = dirtied(solidScriptQueryHelperCreate('in_box', 'Face')) as Extract<
      SolidScriptQueryNode,
      { kind: 'helper' }
    >;
    inbox.inputs = ['[$Face.Center]', '0, 0, 0', '2'];
    const facing = dirtied(solidScriptQueryHelperCreate('facing', 'Face')) as Extract<
      SolidScriptQueryNode,
      { kind: 'helper' }
    >;
    facing.inputs = ['[$Face.Normal]', '0, 1, 0', ''];
    const group = solidScriptQueryGroupCreate('all', [inbox, facing]);
    const text = solidScriptQueryText(group);
    expect(text).toBe('InBox([$Face.Center], Vector(0, 0, 0), 2) && Facing([$Face.Normal], Vector(0, 1, 0))');
    expect(solidScriptQueryText(dirtied(solidScriptQueryRead(text)))).toBe(text);
    expect(solidScriptQueryText(solidScriptQueryRead(text))).toBe(text);
  });

  it('reads All of, Any of, Not and nested groups from the formula', () => {
    const all = solidScriptQueryRead('InBox([$Face.Center], Vector(0, 0, 0), 2) && Near([$Face.Center], [Spot], 1)');
    expect(all.kind).toBe('group');
    if (all.kind !== 'group') return;
    expect(all.join).toBe('all');
    expect(all.items.map((item) => item.kind)).toEqual(['helper', 'helper']);
    const any = solidScriptQueryRead('A || B && C');
    expect(any.kind).toBe('group');
    if (any.kind !== 'group') return;
    expect(any.join).toBe('any');
    expect(any.items[0]?.kind).toBe('custom');
    expect(any.items[1]?.kind).toBe('group');
    if (any.items[1]?.kind !== 'group') return;
    expect(any.items[1].join).toBe('all');
    const nested = solidScriptQueryRead('(A || B) && C');
    expect(nested.kind).toBe('group');
    if (nested.kind !== 'group') return;
    expect(nested.join).toBe('all');
    expect(nested.items[0]?.kind).toBe('group');
    if (nested.items[0]?.kind !== 'group') return;
    expect(nested.items[0].join).toBe('any');
    const negated = solidScriptQueryRead('!InBox([$Face.Center], Vector(0, 0, 0), 2)');
    expect(negated.kind).toBe('group');
    if (negated.kind !== 'group') return;
    expect(negated.items[0]?.kind).toBe('helper');
    expect(negated.items[0]?.not).toBe(true);
  });

  it('keeps unknown or incomplete calls as Custom with the exact text', () => {
    for (const text of [
      'Foo(1)',
      'InBox([$Face.Center])',
      'InBox([$Face.Center], Vector(0, 0, 0), 2, 3)',
      '[$Face.Area] > 1',
    ]) {
      const node = solidScriptQueryRead(text);
      expect(node.kind).toBe('group');
      if (node.kind !== 'group') return;
      expect(node.items[0]?.kind, text).toBe('custom');
      if (node.items[0]?.kind !== 'custom') return;
      expect(node.items[0].text, text).toBe(text);
    }
  });

  it('turns helper inputs into ordinary field text and back', () => {
    expect(solidScriptQueryFieldFromFormula('2')).toBe('2');
    expect(solidScriptQueryFieldFromFormula('[ColumnWidth]')).toBe('[ColumnWidth]');
    expect(solidScriptQueryFieldFromFormula('Vector(0, 1, 0)')).toBe('0, 1, 0');
    expect(solidScriptQueryFieldFromFormula('"Top"')).toBe('Top');
    expect(solidScriptQueryFieldFromFormula('[$Face.Center] + [Offset]')).toBe('[=[$Face.Center] + [Offset]]');
    expect(solidScriptQueryFormulaFromField('2')).toBe('2');
    expect(solidScriptQueryFormulaFromField('[ColumnWidth]')).toBe('[ColumnWidth]');
    expect(solidScriptQueryFormulaFromField('0, 1, 0')).toBe('Vector(0, 1, 0)');
    expect(solidScriptQueryFormulaFromField('Top')).toBe('"Top"');
    expect(solidScriptQueryFormulaFromField('[=[$Face.Center] + [Offset]]')).toBe('[$Face.Center] + [Offset]');
  });

  it('hides the current-element names in easy mode when they use the default', () => {
    expect(solidScriptQueryHidden('Face', 'facing', 'normal')).toBe('[$Face.Normal]');
    expect(solidScriptQueryInputHidden('Face', 'facing', 'normal', '[$Face.Normal]')).toBe(true);
    expect(solidScriptQueryInputHidden('Face', 'facing', 'normal', '[$face.normal]')).toBe(true);
    expect(solidScriptQueryInputHidden('Face', 'facing', 'normal', '[$Other.Normal]')).toBe(false);
    expect(solidScriptQueryInputHidden('Face', 'in_box', 'point', '[$Face.Center]')).toBe(true);
    expect(solidScriptQueryInputHidden('Face', 'in_box', 'center', '0, 0, 0')).toBe(false);
    expect(solidScriptQueryInputHidden('Edge', 'near', 'point', '[$Edge.Middle]')).toBe(true);
    expect(solidScriptQueryInputHidden('Vertex', 'in_box', 'point', '[$Vertex.Position]')).toBe(true);
    expect(solidScriptQueryInputHidden('Brush', 'in_box', 'point', '[$Brush.Center]')).toBe(true);
    expect(solidScriptQueryInputHidden('Item', 'every_nth', 'index', '[$Index]')).toBe(true);
    expect(solidScriptQueryInputHidden('Item', 'in_box', 'point', '[$Item]')).toBe(false);
    expect(solidScriptQueryInputHidden(undefined, 'facing', 'normal', '[$Face.Normal]')).toBe(false);
    const created = solidScriptQueryHelperCreate('in_box', 'Face');
    expect(created.kind).toBe('helper');
    if (created.kind !== 'helper') return;
    expect(created.inputs[0]).toBe('[$Face.Center]');
    expect(created.inputs[1]).toBe('');
  });

  it('titles a Facing row from the hidden element and the direction', () => {
    const facing = solidScriptQueryHelperCreate('facing', 'Face');
    if (facing.kind !== 'helper') return;
    facing.inputs = ['[$Face.Normal]', '0, 1, 0', ''];
    expect(solidScriptQueryTitle(facing, 'Face')).toBe(`Face Points Up, Within ${SOLID_SCRIPT_FACING_WITHIN_DEFAULT}°`);
    facing.inputs[2] = '45';
    expect(solidScriptQueryTitle(facing, 'Face')).toBe('Face Points Up, Within 45°');
    facing.not = true;
    expect(solidScriptQueryTitle(facing, 'Face')).toBe('Not Face Points Up, Within 45°');
    expect(solidScriptQueryTitle(solidScriptQueryCustomCreate('[$Face.Area] > 1'))).toBe('Custom');
    expect(solidScriptQueryTitle(solidScriptQueryGroupCreate('any'))).toBe('Any Of');
  });

  it('wraps value fields in [= ] and leaves condition fields as the formula', () => {
    const formula = 'InBox([$Face.Center], Vector(0, 0, 0), 2)';
    expect(solidScriptQueryBody('value', `[=${formula}]`)).toBe(formula);
    expect(solidScriptQueryBody('condition', formula)).toBe(formula);
    expect(solidScriptQueryBody('value', '[Flag]')).toBe('[Flag]');
    expect(solidScriptQueryStore('value', formula)).toBe(`[=${formula}]`);
    expect(solidScriptQueryStore('condition', formula)).toBe(formula);
    expect(solidScriptQueryStore('value', '')).toBe('');
    const stored = `[=${formula}]`;
    expect(solidScriptQueryToField('value', solidScriptQueryFromField('value', stored))).toBe(stored);
    expect(solidScriptQueryToField('value', solidScriptQueryFromField('value', '[Flag]'))).toBe('[Flag]');
    const edited = dirtied(solidScriptQueryFromField('value', stored));
    expect(solidScriptQueryChanged(edited)).toBe(true);
    expect(solidScriptQueryToField('value', edited)).toBe(stored);
  });

  it('declares one helper per curated condition function', () => {
    const keys = SOLID_SCRIPT_CONDITION_HELPERS.map((helper) => helper.key);
    expect(keys).toEqual(['facing', 'in_box', 'near', 'every_nth', 'has_tag', 'hits']);
    for (const helper of SOLID_SCRIPT_CONDITION_HELPERS) {
      const row = solidScriptQueryHelperCreate(helper.key, 'Face');
      if (row.kind === 'helper' && helper.key === 'facing') row.inputs[1] = '0, 1, 0';
      if (row.kind === 'helper' && helper.key === 'near') row.inputs[2] = '1';
      if (row.kind === 'helper' && helper.key === 'every_nth') row.inputs[1] = '2';
      if (row.kind === 'helper' && helper.key === 'has_tag') row.inputs[1] = 'Top';
      if (row.kind === 'helper' && helper.key === 'in_box') {
        row.inputs[1] = '0, 0, 0';
        row.inputs[2] = '2';
      }
      if (row.kind === 'helper' && helper.key === 'hits') {
        row.inputs[2] = '0, 0, 0';
        row.inputs[3] = '2';
      }
      const text = solidScriptQueryText(row);
      const read = solidScriptQueryRead(text);
      expect(read.kind).toBe('group');
      if (read.kind !== 'group') return;
      expect(read.items[0]?.kind, helper.key).toBe('helper');
      if (read.items[0]?.kind !== 'helper') return;
      expect(read.items[0].key, helper.key).toBe(helper.key);
    }
  });
  it('reads Hits and HitsBox into the same easy-mode row and writes them back', () => {
    const target = solidScriptQueryRead('Hits([$Brush], [Wall], Overlapping)');
    expect(target.kind).toBe('group');
    if (target.kind !== 'group' || target.items[0]?.kind !== 'helper') return;
    expect(target.items[0].key).toBe('hits');
    expect(target.items[0].inputs).toEqual(['[$Brush]', '[Wall]', '', '', 'Overlapping']);
    expect(solidScriptQueryTitle(target.items[0], 'Brush')).toBe('Hits');
    expect(solidScriptQueryInputHidden('Brush', 'hits', 'element', '[$Brush]')).toBe(true);
    const box = dirtied(solidScriptQueryHelperCreate('hits', 'Brush'));
    if (box.kind !== 'helper') return;
    box.inputs = ['[$Brush]', '', '0, 0, 0', '2', ''];
    expect(solidScriptQueryText(box)).toBe('HitsBox([$Brush], Vector(0, 0, 0), 2)');
    expect(solidScriptQueryText(solidScriptQueryRead('HitsBox([$Brush], Vector(0, 0, 0), 2)'))).toBe(
      'HitsBox([$Brush], Vector(0, 0, 0), 2)',
    );
  });
});
