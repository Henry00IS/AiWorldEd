import { afterEach, describe, expect, it } from 'vitest';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveEditorCloseActive } from '@/curve/ui/curve_editor.js';
import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  SOLID_SCRIPT_RESOURCE_KINDS,
  solidScriptDocumentResourcesWith,
  solidScriptResourceCurve,
  solidScriptResourceText,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import { solidScriptProgramRun } from '@/solid_script/language/solid_script_program.js';
import {
  solidScriptExplorerEntries,
  type SolidScriptExplorerEntry,
} from '@/solid_script/ui/solid_script_editor_explorer.js';
import { solidScriptEditorCurrentGet } from '@/solid_script/ui/solid_script_editor_open.js';
import { categoryShow, editorFixture, explorerRows, find, tool } from './solid_script_editor_fixture.js';

/** A curve, a path and a texture, as the Resources tab keeps them. */
const RESOURCES: SolidScriptResource[] = [
  solidScriptResourceCurve(
    'Ramp',
    curveFromPolyline([
      [0, 0],
      [1, 1],
    ]),
  ),
  {
    name: 'Rail',
    kind: 'Path',
    path: {
      points: [
        [0, 0, 0],
        [2, 0, 0],
      ],
      segments: [{ kind: 'Straight' }],
      closed: false,
    },
  },
  { name: 'Brick', kind: 'Texture', textureId: 'tex-brick' },
];

/**
 * Makes a script that reads a curve resource, with some resources.
 *
 * @param resources Resources of its Resources tab.
 * @returns Script.
 */
function script(resources: readonly SolidScriptResource[]): SolidScriptDocument {
  const lines = [{ command: 'echo', values: { value: '[$Resources.Ramp]' } }, { command: 'cube' }];
  return solidScriptDocumentResourcesWith(solidScriptDocumentCreate(lines), resources);
}

/**
 * Reads the $Resources entry the variable viewer lists for a script.
 *
 * @param resources Resources of the script.
 * @returns Entry.
 */
function resourcesEntry(resources: readonly SolidScriptResource[]): SolidScriptExplorerEntry {
  const entries = solidScriptExplorerEntries(script(resources), [], [], { system: [], stoppedBefore: null });
  const entry = entries.find((candidate) => candidate.name === '$Resources');
  if (!entry) throw new Error('Expected $Resources');
  return entry;
}

afterEach(() => {
  solidScriptEditorCurrentGet()?.close();
  document.body.replaceChildren();
});

describe('$Resources in the variable viewer', () => {
  it('says No Resources Yet only while the script has none', () => {
    expect(resourcesEntry([])).toMatchObject({ value: 'No Resources Yet', placeholder: true, items: [] });
  });

  it('lists every resource by letter, typed by kind, with the value $Resources.Name reads in a run', () => {
    const entry = resourcesEntry(RESOURCES);
    expect(entry).toMatchObject({ value: '3 Resources', members: true });
    expect(entry.placeholder).toBeUndefined();
    expect(entry.items.map((item) => [item.name, item.type])).toEqual([
      ['$Resources.Brick', 'Texture'],
      ['$Resources.Rail', 'Path'],
      ['$Resources.Ramp', 'Curve'],
    ]);
    const echoed = ['Brick', 'Rail', 'Ramp'].map(
      (name) =>
        solidScriptProgramRun(
          solidScriptDocumentResourcesWith(
            solidScriptDocumentCreate([{ command: 'echo', values: { value: `[$Resources.${name}]` } }]),
            RESOURCES,
          ),
        ).messages[0],
    );
    expect(entry.items.map((item) => item.value)).toEqual(echoed);
  });

  it('lists a text resource as kind Text, with the words $Resources.Name reads in a run', () => {
    const note = solidScriptResourceText('Note', '  [$Local.X]  ');
    const entry = resourcesEntry([note]);
    expect(entry).toMatchObject({ value: '1 Resource', members: true });
    expect(entry.items.map((item) => [item.name, item.type, item.value])).toEqual([
      ['$Resources.Note', 'Text', '  [$Local.X]  '],
    ]);
  });

  it('shows the same name, value and type in All as on the System tab, for every resource kind', () => {
    const resources = [...RESOURCES, solidScriptResourceText('Text', 'Hello, [$Local.X]')];
    expect(new Set(resources.map((resource) => resource.kind))).toEqual(new Set(SOLID_SCRIPT_RESOURCE_KINDS));
    const entries = solidScriptExplorerEntries(script(resources), [], [], { system: [], stoppedBefore: null });
    const shown = (
      item: Pick<SolidScriptExplorerEntry, 'name' | 'value' | 'type'>,
    ): { name: string; value: string | null; type: string } => ({
      name: item.name,
      value: item.value,
      type: item.type,
    });
    const all = entries.filter((entry) => entry.category === 'Resources').map(shown);
    const system = (entries.find((entry) => entry.name === '$Resources')?.items ?? []).map(shown);
    expect(all).toEqual(system);
    expect(all.map((row) => row.type).sort()).toEqual([...SOLID_SCRIPT_RESOURCE_KINDS].sort());
    expect(all.every((row) => row.value !== null)).toBe(true);
  });

  it('follows the resources as they are added, renamed and removed', () => {
    expect(resourcesEntry(RESOURCES.slice(0, 1)).value).toBe('1 Resource');
    const renamed = resourcesEntry([{ ...RESOURCES[2]!, name: 'Stone' }, RESOURCES[0]!]);
    expect(renamed.items.map((item) => item.name)).toEqual(['$Resources.Ramp', '$Resources.Stone']);
    expect(resourcesEntry(RESOURCES.slice(1, 2)).items.map((item) => item.name)).toEqual(['$Resources.Rail']);
  });

  it('shows a resource it cannot read with the reason, instead of hiding it', () => {
    const broken = { name: 'Bad', kind: 'Curve', curve: { points: [] } } as unknown as SolidScriptResource;
    const [item] = resourcesEntry([broken]).items;
    expect(item).toMatchObject({ name: '$Resources.Bad', type: 'Curve' });
    expect(item?.value).toMatch(/could not be read/);
  });

  it('updates in the editor as the Resources tab adds, renames and removes a curve', () => {
    const fixture = editorFixture([{ command: 'cube' }]);
    const row = (): string | undefined => explorerRows().find((text) => /^[▸▾ ]*\$Resources\|/.test(text));
    const system = (): string | undefined => (categoryShow('System'), row());
    expect(system()).toMatch(/\|No Resources Yet\|/);
    tool('New Curve').click();
    curveEditorCloseActive();
    expect(system()).toMatch(/\|1 Resource\|/);
    find('.solid-script-editor-explorer-row[data-name="$Resources"]').firstElementChild?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(explorerRows()).toContainEqual(
      expect.stringMatching(/^\$Resources\.Curve\|Curve\(\[\[0, 1\], \[1, 1\]\]\)\|Curve/),
    );
    const name = find<HTMLInputElement>('input[aria-label="Resource name"]');
    name.value = 'Slope';
    name.dispatchEvent(new Event('change'));
    categoryShow('System');
    expect(explorerRows()).toContainEqual(expect.stringMatching(/^\$Resources\.Slope\|/));
    expect(explorerRows().some((text) => text.startsWith('$Resources.Curve|'))).toBe(false);
    const tile = (): HTMLElement => find('[data-file-path="$Resources.Slope"]');
    tile().click();
    tile().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(fixture.script().resources ?? []).toEqual([]);
    expect(system()).toMatch(/\|No Resources Yet\|/);
  });

  it('shows the same resource values in the All view as on the System tab', () => {
    editorFixture([{ command: 'cube' }]);
    tool('New Text').click();
    tool('New Curve').click();
    curveEditorCloseActive();
    const rowsOf = (category: string): [string, string][] => {
      categoryShow(category);
      if (category === 'System')
        find('.solid-script-editor-explorer-row[data-name="$Resources"]').firstElementChild?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        );
      return explorerRows()
        .filter((text) => text.startsWith('$Resources.'))
        .map((text) => {
          const [name, value] = text.split('|');
          return [name ?? '', value ?? ''];
        });
    };
    const all = rowsOf('All');
    const system = rowsOf('System');
    expect(all.map((row) => row[0]).sort()).toEqual(['$Resources.Curve', '$Resources.Text']);
    expect(all).toEqual(system);
    expect(all.find((row) => row[0] === '$Resources.Text')?.[1]).not.toBe('—');
  });
});
