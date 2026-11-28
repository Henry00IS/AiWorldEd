import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { PATH_ASSET_DEFAULT } from '@/path/model/path_asset.js';
import { pathFileWrite } from '@/path/model/path_file.js';
import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentResourcesWith,
  solidScriptResourceCurve,
  solidScriptResourceText,
} from '@/solid_script/document/solid_script_resource.js';
import { solidScriptResourceNameOfFile } from '@/solid_script/document/solid_script_resource_file.js';
import { solidScriptFileDecode, solidScriptFileEncode } from '@/solid_script/file/solid_script_file.js';
import { SolidScriptEditorResources } from '@/solid_script/ui/solid_script_editor_resources.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';

/** Smallest PNG: one transparent pixel. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
);

/** A curve going up. */
const RAMP = curveFromPolyline([
  [0, 0],
  [1, 1],
]);

/**
 * Builds the tab showing a script, keeping what it stores.
 *
 * @param script Script shown.
 * @returns Tab and the stored scripts.
 */
function tab(script: SolidScriptDocument): { resources: SolidScriptEditorResources; stored: SolidScriptDocument[] } {
  const stored: SolidScriptDocument[] = [];
  const resources = new SolidScriptEditorResources((next) => {
    stored.push(next);
    resources.write(next);
  });
  resources.write(script);
  document.body.replaceChildren(resources.element);
  return { resources, stored };
}

/**
 * Drops desktop files onto the tab.
 *
 * @param resources Tab.
 * @param files Files.
 */
function drop(resources: SolidScriptEditorResources, files: File[]): void {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  const transfer = { types: ['Files'], getData: () => '', files };
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  resources.element.dispatchEvent(event);
}

/**
 * Finds the tile of a resource.
 *
 * @param resources Tab.
 * @param name Resource name.
 * @returns Tile.
 */
function tileOf(resources: SolidScriptEditorResources, name: string): HTMLElement {
  return resources.element.querySelector<HTMLElement>(`[data-file-path="$Resources.${name}"]`)!;
}

describe('Resources tab', () => {
  beforeEach(() => getTextureMapCache().setLibrary(new TextureLibrary()));
  afterEach(() => getTextureMapCache().setLibrary(null));

  it('copies dropped images, curves and paths into the script as tiles named after their files', async () => {
    const { resources, stored } = tab(solidScriptDocumentCreate([]));
    drop(resources, [
      new File([PNG], 'stone wall.png', { type: 'image/png' }),
      new File([curveFileWrite(RAMP, 'Ramp')], 'ramp.aicurve'),
      new File([pathFileWrite(PATH_ASSET_DEFAULT, 'Track')], 'track.aipath'),
    ]);
    await vi.waitFor(() => expect(stored).toHaveLength(1));
    const kept = stored[0]!.resources!;
    expect(kept.map((resource) => `${resource.kind} ${resource.name}`)).toEqual([
      'Texture Stone_wall',
      'Curve Ramp',
      'Path Track',
    ]);
    expect(kept[0]).toMatchObject({ textureId: expect.stringMatching(/^embedded:[0-9a-f]{64}\.png$/) });
    expect(resources.element.querySelectorAll('[data-file-path]')).toHaveLength(3);
    expect(tileOf(resources, 'Ramp').title).toBe('[$Resources.Ramp]');
  });

  it('tells which dropped files do not fit, and adds the rest', async () => {
    const { resources, stored } = tab(solidScriptDocumentCreate([]));
    drop(resources, [new File(['x'], 'notes.md'), new File([curveFileWrite(RAMP, 'Ramp')], 'ramp.aicurve')]);
    await vi.waitFor(() => expect(stored).toHaveLength(1));
    expect(resources.element.textContent).toContain('notes.md is not a texture, curve, path or text file.');
  });

  it('renames the selected resource only to a valid free name, and removes it with Delete', () => {
    const script = solidScriptDocumentResourcesWith(solidScriptDocumentCreate([]), [
      solidScriptResourceCurve('Ramp', RAMP),
      solidScriptResourceCurve('Arch', RAMP),
    ]);
    const { resources, stored } = tab(script);
    tileOf(resources, 'Ramp').click();
    const name = (): HTMLInputElement => resources.element.querySelector('input[aria-label="Resource name"]')!;
    name().value = 'Arch';
    name().dispatchEvent(new Event('change'));
    expect(name().validationMessage).toContain('already called Arch');
    name().value = '9 bad';
    name().dispatchEvent(new Event('change'));
    expect(stored).toHaveLength(0);
    name().value = 'Slope';
    name().dispatchEvent(new Event('change'));
    expect(stored.at(-1)?.resources?.map((resource) => resource.name)).toEqual(['Slope', 'Arch']);
    tileOf(resources, 'Slope').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(stored.at(-1)?.resources?.map((resource) => resource.name)).toEqual(['Arch']);
  });

  it('saves a copy of each texture inside the script file, which loads in another project', async () => {
    const { resources, stored } = tab(solidScriptDocumentCreate([]));
    drop(resources, [new File([PNG], 'brick.png', { type: 'image/png' })]);
    await vi.waitFor(() => expect(stored).toHaveLength(1));
    const file = await solidScriptFileEncode(stored[0]!);
    getTextureMapCache().setLibrary(new TextureLibrary());
    const loaded = await solidScriptFileDecode(file);
    const texture = loaded.resources![0]!;
    expect(texture).toEqual(stored[0]!.resources![0]);
    if (texture.kind !== 'Texture') throw new Error('not a texture');
    expect(getTextureMapCache().getLibrary()!.getEntryById(texture.textureId)?.sourceFile.size).toBe(PNG.length);
  });

  it('names resources after their files', () => {
    expect(solidScriptResourceNameOfFile('textures/old-brick 2.jpg')).toBe('Old_brick_2');
    expect(solidScriptResourceNameOfFile('01.png')).toBe('Resource01');
    expect(solidScriptResourceNameOfFile('.png')).toBe('Resource');
  });
});

describe('Resources tab New Curve', () => {
  it('adds a curve with a free name and selects it', () => {
    const script = solidScriptDocumentResourcesWith(solidScriptDocumentCreate([]), [
      solidScriptResourceCurve('Curve', RAMP),
    ]);
    const { resources, stored } = tab(script);
    const button = [...resources.element.querySelectorAll('button')].find((each) => each.textContent === 'New Curve')!;
    button.click();
    expect(stored.at(-1)?.resources?.map((resource) => resource.name)).toEqual(['Curve', 'Curve2']);
    expect(resources.element.querySelector<HTMLInputElement>('input[aria-label="Resource name"]')?.value).toBe(
      'Curve2',
    );
    expect(tileOf(resources, 'Curve2').getAttribute('aria-selected')).toBe('true');
  });
});

describe('Resources tab Text', () => {
  it('adds a text with a free name, and keeps what is typed in its box, including spaces', () => {
    const script = solidScriptDocumentResourcesWith(solidScriptDocumentCreate([]), [
      solidScriptResourceText('Text', 'already'),
    ]);
    const { resources, stored } = tab(script);
    const button = [...resources.element.querySelectorAll('button')].find((each) => each.textContent === 'New Text')!;
    button.click();
    expect(stored.at(-1)?.resources?.map((resource) => resource.name)).toEqual(['Text', 'Text2']);
    expect(resources.element.querySelector<HTMLInputElement>('input[aria-label="Resource name"]')?.value).toBe('Text2');
    expect(tileOf(resources, 'Text2').getAttribute('aria-selected')).toBe('true');
    const box = resources.element.querySelector<HTMLTextAreaElement>('textarea[aria-label="Resource text"]')!;
    expect(box.value).toBe('');
    box.value = '  [$Local.X]\n$[keep]  ';
    box.dispatchEvent(new Event('change'));
    const kept = stored.at(-1)?.resources?.find((resource) => resource.name === 'Text2');
    expect(kept).toEqual(solidScriptResourceText('Text2', '  [$Local.X]\n$[keep]  '));
  });

  it('copies a dropped .txt file as a text resource, keeping its words exactly', async () => {
    const { resources, stored } = tab(solidScriptDocumentCreate([]));
    const words = '  hello [$Local.X]\nunicode café\n';
    drop(resources, [new File([words], 'greeting.txt', { type: 'text/plain' })]);
    await vi.waitFor(() => expect(stored).toHaveLength(1));
    expect(stored[0]!.resources).toEqual([solidScriptResourceText('Greeting', words)]);
    tileOf(resources, 'Greeting').click();
    expect(resources.element.querySelector<HTMLTextAreaElement>('textarea[aria-label="Resource text"]')?.value).toBe(
      words,
    );
  });

  it('renames and removes a text resource, and writes TEXT on its tile', () => {
    const { resources, stored } = tab(
      solidScriptDocumentResourcesWith(solidScriptDocumentCreate([]), [solidScriptResourceText('Note', '  hi  ')]),
    );
    const tile = tileOf(resources, 'Note');
    expect(tile.textContent).toContain('TEXT');
    tile.click();
    const name = resources.element.querySelector<HTMLInputElement>('input[aria-label="Resource name"]')!;
    name.value = 'Label';
    name.dispatchEvent(new Event('change'));
    expect(stored.at(-1)?.resources).toEqual([solidScriptResourceText('Label', '  hi  ')]);
    tileOf(resources, 'Label').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(stored.at(-1)?.resources ?? []).toEqual([]);
  });
});
