import { afterEach, describe, expect, it } from 'vitest';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptOfEmpty,
  solidScriptSelectFix,
  solidScriptSelectFixLabel,
  solidScriptSelectFresh,
  solidScriptSelectIds,
  SOLID_SCRIPT_SELECT_BETWEEN,
} from '@/solid_script/language/solid_script_select.js';
import { SolidScriptElement } from '@/solid_script/language/solid_script_value.js';
import { editorFixture } from '../ui/solid_script_editor_fixture.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';

const CUBE: SolidScriptLine = { command: 'cube', values: { anchor: 'Center, Center, Center' } };
const SPHERE: SolidScriptLine = { command: 'sphere', values: { anchor: 'Center, Center, Center' } };
const SELECT_BRUSHES: SolidScriptLine = { command: 'select_objects' };
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

describe('SolidScript Select Objects and Which Between', () => {
  it('leaves [$Selected.Objects] empty until Select Objects or a Set', () => {
    expect(printed(CUBE, { command: 'echo', values: { value: '[$Selected.Objects.Count]' } })).toEqual(['0']);
    expect(printed(CUBE, SELECT_BRUSHES, { command: 'echo', values: { value: '[$Selected.Objects.Count]' } })).toEqual([
      '1',
    ]);
    expect(
      printed(
        CUBE,
        { command: 'variable', values: { name: '$Selected.Objects', value: '[$Input.Objects]' } },
        { command: 'echo', values: { value: '[$Selected.Objects.Count]' } },
      ),
    ).toEqual(['0']);
  });

  it('lets Clip work after Select Objects, and stops with the two-sentence text when Of is empty', () => {
    expect(run(CUBE, SELECT_BRUSHES, { command: 'clip' }).error).toBeNull();
    expect(run(CUBE, { command: 'clip' }).error?.message).toContain(solidScriptOfEmpty('Clip', 'objects'));
    expect(run(CUBE, { command: 'extrude_face' }).error?.message).toContain(
      solidScriptOfEmpty('Extrude Face', 'faces'),
    );
    expect(run({ command: 'select_faces' }).error?.message).toContain(solidScriptOfEmpty('Select Faces', 'objects'));
  });

  it('names the one-click Select fix for an empty-Of stop', () => {
    const fix = solidScriptSelectFix(solidScriptOfEmpty('Clip', 'objects'));
    expect(fix).toEqual({ command: 'select_objects', label: 'Select Objects' });
    expect(fix ? solidScriptSelectFixLabel(fix.label) : '').toBe('Add Select Objects Above');
    expect(solidScriptSelectFix(solidScriptOfEmpty('Extrude Face', 'faces'))).toEqual({
      command: 'select_faces',
      label: 'Select Faces',
    });
    expect(solidScriptSelectFix('Clip has no solids in Of; check that Of holds objects')).toBeNull();
  });

  it('picks every built solid, or only those added since the last Select Objects', () => {
    expect(
      printed(
        CUBE,
        SPHERE,
        { command: 'select_objects', values: { into: 'All' } },
        { command: 'echo', values: { value: '[All.Count]' } },
        { command: 'cylinder', values: { anchor: 'Center, Center, Center' } },
        { command: 'select_objects', values: { which: SOLID_SCRIPT_SELECT_BETWEEN, into: 'New' } },
        { command: 'echo', values: { value: '[New.Count] [New.First.Name]' } },
      ),
    ).toEqual(['2', '1 cylinder']);
  });

  it('treats every current solid as new when no Select Objects has run yet', () => {
    expect(
      printed(
        CUBE,
        SPHERE,
        { command: 'select_objects', values: { which: SOLID_SCRIPT_SELECT_BETWEEN, into: 'New' } },
        { command: 'echo', values: { value: '[New.Count]' } },
      ),
    ).toEqual(['2']);
  });

  it('keeps the Which Between snapshot across Repeat and For Each', () => {
    expect(
      printed(
        { command: 'repeat', values: { from: '1', to: '3' } },
        CUBE,
        { command: 'select_objects', values: { which: SOLID_SCRIPT_SELECT_BETWEEN, into: 'Fresh' } },
        { command: 'echo', values: { value: '[Fresh.Count]' } },
        END,
      ),
    ).toEqual(['1', '1']);
    expect(
      printed(
        { command: 'for_each', values: { variable: 'Step', list: 'a, b' } },
        CUBE,
        { command: 'select_objects', values: { which: SOLID_SCRIPT_SELECT_BETWEEN, into: 'Fresh' } },
        { command: 'echo', values: { value: '[Fresh.Count]' } },
        END,
      ),
    ).toEqual(['1', '1']);
  });

  it('picks Which Between faces of a later cube after Select Faces of the first', () => {
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        { command: 'select_faces', values: { which: 'All', into: 'First' } },
        CUBE,
        SELECT_BRUSHES,
        { command: 'select_faces', values: { which: SOLID_SCRIPT_SELECT_BETWEEN, into: 'Later' } },
        { command: 'echo', values: { value: '[First.Count] [Later.Count]' } },
      ),
    ).toEqual(['6 6']);
  });

  it('picks Which Between inside a Part from solids built since the previous Select', () => {
    expect(
      printed(
        CUBE,
        SELECT_BRUSHES,
        { command: 'part', values: { name: 'Extra' } },
        SPHERE,
        { command: 'select_objects', values: { which: SOLID_SCRIPT_SELECT_BETWEEN, into: 'Fresh' } },
        { command: 'echo', values: { value: '[Fresh.Count]' } },
        END,
      ),
    ).toEqual(['1']);
  });

  it('filters ids the way Which Between does, including the first Select', () => {
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

  it('inserts Select Objects set to Which Between above Clip, without opening the configurator', () => {
    const { root, script, commands } = editorFixture([CUBE, { command: 'clip' }]);
    const button = [...root.querySelectorAll('button')].find(
      (entry) => entry.textContent === 'Add Select Objects Above',
    );
    expect(button).toBeDefined();
    expect(root.querySelector('[data-solid-script-configurator]')).toBeNull();
    expect(root.textContent).toContain("doesn't know which objects");
    button?.click();
    expect(commands()).toEqual(['cube', 'select_objects', 'clip']);
    expect(script().blocks[1]?.values['which']).toBe(SOLID_SCRIPT_SELECT_BETWEEN);
    expect(root.querySelector('[data-solid-script-configurator]')).toBeNull();
    expect(root.textContent).not.toContain("doesn't know which objects");
  });

  it('does not accept Which New, and still accepts How New', () => {
    expect(run(CUBE, { command: 'select_objects', values: { which: 'New' } }).error?.message).toContain(
      'Which must be one of All, Between, not "New"',
    );
    expect(run(CUBE, { command: 'select_objects', values: { which: 'Between', how: 'New' } }).error).toBeNull();
  });
});
