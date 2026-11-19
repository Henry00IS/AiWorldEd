import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptOfEmpty,
  solidScriptSelectFix,
  solidScriptSelectFixLabel,
  solidScriptSelectFresh,
  solidScriptSelectIds,
  SOLID_SCRIPT_SELECT_NEW,
} from '@/solid_script/language/solid_script_select.js';
import { SolidScriptElement } from '@/solid_script/language/solid_script_value.js';
import { editorFixture } from '../ui/solid_script_editor_fixture.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';

const CUBE: SolidScriptLine = { command: 'cube', values: { anchor: 'Center, Center, Center' } };
const SPHERE: SolidScriptLine = { command: 'sphere', values: { anchor: 'Center, Center, Center' } };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_brushes' };
const END: SolidScriptLine = { command: 'end' };

/**
 * Runs script lines.
 *
 * @param lines Lines.
 * @returns Run result.
 */
function run(...lines: SolidScriptLine[]) {
  return solidScriptProgramRun(solidScriptDocumentCreate(lines));
}

/**
 * Messages a script printed, or its error.
 *
 * @param lines Lines.
 * @returns Messages.
 */
function printed(...lines: SolidScriptLine[]): string[] {
  const result = run(...lines);
  return result.error ? [result.error.message] : result.messages;
}

describe('SolidScript Select Brushes and Which New', () => {
  it('leaves [$Selected.Brushes] empty until Select Brushes or a Set', () => {
    expect(printed(CUBE, { command: 'echo', values: { value: '[$Selected.Brushes.Count]' } })).toEqual(['0']);
    expect(printed(CUBE, SELECT_BRUSHES, { command: 'echo', values: { value: '[$Selected.Brushes.Count]' } })).toEqual([
      '1',
    ]);
    expect(
      printed(
        CUBE,
        { command: 'variable', values: { name: '$Selected.Brushes', value: '[$Input.Brushes]' } },
        { command: 'echo', values: { value: '[$Selected.Brushes.Count]' } },
      ),
    ).toEqual(['0']);
  });

  it('lets Clip work after Select Brushes, and stops with the two-sentence text when Of is empty', () => {
    expect(run(CUBE, SELECT_BRUSHES, { command: 'clip' }).error).toBeNull();
    expect(run(CUBE, { command: 'clip' }).error?.message).toContain(solidScriptOfEmpty('Clip', 'brushes'));
    expect(run(CUBE, { command: 'extrude_face' }).error?.message).toContain(
      solidScriptOfEmpty('Extrude Face', 'faces'),
    );
    expect(run({ command: 'select_faces' }).error?.message).toContain(solidScriptOfEmpty('Select Faces', 'brushes'));
  });

  it('names the one-click Select fix for an empty-Of stop', () => {
    const fix = solidScriptSelectFix(solidScriptOfEmpty('Clip', 'brushes'));
    expect(fix).toEqual({ command: 'select_brushes', label: 'Select Brushes' });
    expect(fix ? solidScriptSelectFixLabel(fix.label) : '').toBe('Add Select Brushes Above');
    expect(solidScriptSelectFix(solidScriptOfEmpty('Extrude Face', 'faces'))).toEqual({
      command: 'select_faces',
      label: 'Select Faces',
    });
    expect(solidScriptSelectFix('Clip has no brushes in Of; check that Of holds brushes or meshes')).toBeNull();
  });

  it('picks every built brush, or only those added since the last Select Brushes', () => {
    expect(
      printed(
        CUBE,
        SPHERE,
        { command: 'select_brushes', values: { into: 'All' } },
        { command: 'echo', values: { value: '[All.Count]' } },
        { command: 'cylinder', values: { anchor: 'Center, Center, Center' } },
        { command: 'select_brushes', values: { which: SOLID_SCRIPT_SELECT_NEW, into: 'New' } },
        { command: 'echo', values: { value: '[New.Count] [New.First.Name]' } },
      ),
    ).toEqual(['2', '1 cylinder']);
  });

  it('treats every current brush as new when no Select Brushes has run yet', () => {
    expect(
      printed(
        CUBE,
        SPHERE,
        { command: 'select_brushes', values: { which: SOLID_SCRIPT_SELECT_NEW, into: 'New' } },
        { command: 'echo', values: { value: '[New.Count]' } },
      ),
    ).toEqual(['2']);
  });

  it('keeps the Which New snapshot across Repeat and For Each', () => {
    expect(
      printed(
        { command: 'repeat', values: { from: '1', to: '2' } },
        CUBE,
        { command: 'select_brushes', values: { which: SOLID_SCRIPT_SELECT_NEW, into: 'Fresh' } },
        { command: 'echo', values: { value: '[Fresh.Count]' } },
        END,
      ),
    ).toEqual(['1', '1']);
    expect(
      printed(
        { command: 'for_each', values: { variable: 'Step', list: 'a, b' } },
        CUBE,
        { command: 'select_brushes', values: { which: SOLID_SCRIPT_SELECT_NEW, into: 'Fresh' } },
        { command: 'echo', values: { value: '[Fresh.Count]' } },
        END,
      ),
    ).toEqual(['1', '1']);
  });

  it('picks Which New faces of a later cube after Select Faces of the first', () => {
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        { command: 'select_faces', values: { which: 'All', into: 'First' } },
        CUBE,
        SELECT_BRUSHES,
        { command: 'select_faces', values: { which: SOLID_SCRIPT_SELECT_NEW, into: 'Later' } },
        { command: 'echo', values: { value: '[First.Count] [Later.Count]' } },
      ),
    ).toEqual(['6 6']);
  });

  it('picks Which New inside a Part from brushes built since the previous Select', () => {
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        { command: 'part', values: { name: 'Extra' } },
        SPHERE,
        { command: 'select_brushes', values: { which: SOLID_SCRIPT_SELECT_NEW, into: 'Fresh' } },
        { command: 'echo', values: { value: '[Fresh.Count]' } },
        END,
      ),
    ).toEqual(['1']);
  });

  it('filters ids the way Which New does, including the first Select', () => {
    const first = new SolidScriptElement('brush', 1);
    const second = new SolidScriptElement('brush', 2);
    expect(solidScriptSelectFresh(undefined, [first, second])).toEqual([first, second]);
    expect(solidScriptSelectFresh(solidScriptSelectIds([first]), [first, second])).toEqual([second]);
  });
});

describe('SolidScript empty-Of Select fix in the editor', () => {
  afterEach(() => {
    solidScriptEditorCurrentGet()?.close();
    document.body.replaceChildren();
  });

  it('inserts Select Brushes set to Which New above Clip, without opening the configurator', () => {
    const { root, script, commands } = editorFixture([CUBE, { command: 'clip' }]);
    const button = [...root.querySelectorAll('button')].find(
      (entry) => entry.textContent === 'Add Select Brushes Above',
    );
    expect(button).toBeDefined();
    expect(root.querySelector('[data-solid-script-configurator]')).toBeNull();
    expect(root.textContent).toContain("doesn't know which brushes");
    button?.click();
    expect(commands()).toEqual(['cube', 'select_brushes', 'clip']);
    expect(script().blocks[1]?.values['which']).toBe(SOLID_SCRIPT_SELECT_NEW);
    expect(root.querySelector('[data-solid-script-configurator]')).toBeNull();
    expect(root.textContent).not.toContain("doesn't know which brushes");
  });
});
