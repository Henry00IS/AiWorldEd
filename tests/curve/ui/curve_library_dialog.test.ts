import { afterEach, describe, expect, it } from 'vitest';
import { curveEquals, curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { CurveEditor, curveEditorActiveFor, curveEditorCloseActive } from '@/curve/ui/curve_editor.js';
import {
  CurveLibraryExistsError,
  curveLibrarySourceSet,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';

const start = curveFromPolyline([
  [0, 1],
  [1, 1],
]);
const ogee = curveFromPolyline([
  [0, 0],
  [0.5, 0.8],
  [1, 0.2],
]);

/**
 * Builds an in-memory curve location.
 *
 * @param id Source id.
 * @param files Files by name.
 * @param writable Whether it takes saves.
 * @returns Source.
 */
function memorySource(id: CurveLibrarySource['id'], files: Map<string, string>, writable = true): CurveLibrarySource {
  return {
    id,
    writable: () => writable,
    readOnlyReason: () => (writable ? null : "The room owner's curves are read-only; save to Local instead."),
    list: () => [...files.keys()].map((fileName) => ({ fileName, size: 1, lastModified: 1 })),
    read: async (fileName) => files.get(fileName) ?? '',
    write: async (fileName, text, overwrite) => {
      if (!overwrite && files.has(fileName)) throw new CurveLibraryExistsError(fileName);
      files.set(fileName, text);
    },
  };
}

/**
 * Opens a curve editor named "Profile".
 *
 * @returns Editor, anchor and its commits.
 */
function openEditor() {
  const anchor = document.createElement('div');
  document.body.appendChild(anchor);
  const commits: Curve[] = [];
  const editor = CurveEditor.open({
    title: 'Profile',
    anchor,
    curve: start,
    presets: CURVE_PRESETS_ARCHITECTURE,
    fileName: 'Profile',
    onPreview: () => undefined,
    onCommit: (curve) => commits.push(curve),
  });
  return { editor, anchor, commits };
}

/**
 * Clicks a visible button by its text.
 *
 * @param label Button text.
 * @param scope Element to search.
 */
function click(label: string, scope: ParentNode = document): void {
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find((each) => each.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  button.click();
}

/**
 * Returns the open curve dialog.
 *
 * @returns Dialog root, or null.
 */
function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-curve-library-dialog]');
}

/** Lets queued promises run. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('curve Save and Load dialogs', () => {
  afterEach(() => {
    curveEditorCloseActive();
    for (const id of ['project', 'remote', 'local'] as const) curveLibrarySourceSet(id, null);
    document.body.replaceChildren();
  });

  it('saves to Local as "Profile", never offering Remote, asking Yes/No before overwriting', async () => {
    const remote = new Map<string, string>([['Profile.aicurve', 'remote']]);
    const local = new Map<string, string>([['Profile.aicurve', 'old']]);
    curveLibrarySourceSet('remote', memorySource('remote', remote));
    curveLibrarySourceSet('local', memorySource('local', local));
    const { editor, anchor } = openEditor();
    click('Save', editor.getElement());
    await settle();
    const save = dialog();
    expect(save?.textContent).toContain('Save Curve');
    expect(save?.querySelector<HTMLInputElement>('input[aria-label="Curve name"]')?.value).toBe('Profile');
    expect([...(save?.querySelectorAll('[data-curve-source]') ?? [])].map((tab) => tab.textContent)).toEqual(['Local']);
    expect(save?.querySelector('[data-curve-file="Profile.aicurve"]')?.textContent).toBe('Profile');
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(curveEditorActiveFor(anchor)).toBe(editor);
    click('Save', save ?? document);
    await settle();
    const question = document.querySelector('[role="alertdialog"]');
    expect(question?.textContent).toContain('Overwrite Curve?');
    expect(question?.textContent).toContain('"Profile" already exists in Local. Overwrite it?');
    click('No', question ?? document);
    await settle();
    expect(local.get('Profile.aicurve')).toBe('old');
    expect(editor.getElement().textContent).toContain('Kept the existing Profile.aicurve in Local');
    click('Save', editor.getElement());
    await settle();
    click('Save', dialog() ?? document);
    await settle();
    click('Yes', document.querySelector('[role="alertdialog"]') ?? document);
    await settle();
    await settle();
    expect(local.get('Profile.aicurve')).not.toBe('old');
    expect(remote.get('Profile.aicurve')).toBe('remote');
    expect(editor.getElement().textContent).toContain('Saved Profile.aicurve to Local');
    expect(curveEditorActiveFor(anchor)).toBe(editor);
  });

  it('loads from read-only Remote curves', async () => {
    const remote = new Map([['Ogee.aicurve', curveFileWrite(ogee, 'Ogee')]]);
    curveLibrarySourceSet('remote', memorySource('remote', remote, false));
    curveLibrarySourceSet('local', memorySource('local', new Map()));
    const { editor, commits } = openEditor();
    click('Load', editor.getElement());
    await settle();
    expect(dialog()?.textContent).toContain('Load Curve');
    dialog()?.querySelector<HTMLElement>('[data-curve-source="remote"]')?.click();
    dialog()?.querySelector<HTMLElement>('[data-curve-file="Ogee.aicurve"]')?.click();
    click('Load', dialog() ?? document);
    await settle();
    await settle();
    expect(editor.getElement().textContent).toContain('Loaded Ogee');
    expect(commits.some((curve) => curveEquals(curve, ogee))).toBe(true);
    expect(dialog()).toBeNull();
  });
});
