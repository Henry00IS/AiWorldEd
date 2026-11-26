import { describe, expect, it } from 'vitest';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { solidScriptDocumentCreate, type SolidScriptDocument } from '@/solid_script/document/solid_script_document.js';
import {
  solidScriptDocumentResourcesWith,
  solidScriptResourceCurve,
} from '@/solid_script/document/solid_script_resource.js';
import { SolidScriptEditorResources } from '@/solid_script/ui/solid_script_editor_resources.js';
import { TEXTURE_BROWSER_DRAG_TYPE } from '@/texture/ui/browser/texture_browser_drag.js';

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
  return { resources, stored };
}

/**
 * Clicks a button of the tab by its caption.
 *
 * @param resources Tab.
 * @param caption Caption.
 */
function click(resources: SolidScriptEditorResources, caption: string): void {
  const button = [...resources.element.querySelectorAll('button')].find((each) => each.textContent === caption);
  if (!button) throw new Error(`no ${caption} button`);
  button.click();
}

describe('Resources tab', () => {
  it('adds a curve, a path and a texture with free names', () => {
    const { resources, stored } = tab(solidScriptDocumentCreate([]));
    click(resources, 'Add Curve');
    click(resources, 'Add Curve');
    click(resources, 'Add Path');
    click(resources, 'Add Texture');
    expect(stored.at(-1)?.resources?.map((resource) => `${resource.kind} ${resource.name}`)).toEqual([
      'Curve Curve',
      'Curve Curve2',
      'Path Path',
      'Texture Texture',
    ]);
    expect(resources.element.querySelectorAll('[data-solid-script-resource]')).toHaveLength(4);
  });

  it('renames a resource only to a valid free name, and removes one', () => {
    const script = solidScriptDocumentResourcesWith(solidScriptDocumentCreate([]), [
      solidScriptResourceCurve(
        'Ramp',
        curveFromPolyline([
          [0, 0],
          [1, 1],
        ]),
      ),
      { name: 'Brick', kind: 'Texture', texture: 't' },
    ]);
    const { resources, stored } = tab(script);
    const name = (): HTMLInputElement => resources.element.querySelector('input[aria-label="Resource name"]')!;
    name().value = 'Brick';
    name().dispatchEvent(new Event('change'));
    expect(stored).toHaveLength(0);
    expect(name().validationMessage).toContain('already called Brick');
    name().value = '9 bad';
    name().dispatchEvent(new Event('change'));
    expect(stored).toHaveLength(0);
    name().value = 'Slope';
    name().dispatchEvent(new Event('change'));
    expect(stored.at(-1)?.resources?.map((resource) => resource.name)).toEqual(['Slope', 'Brick']);
    click(resources, 'Remove');
    expect(stored.at(-1)?.resources?.map((resource) => resource.name)).toEqual(['Brick']);
    click(resources, 'Remove');
    expect('resources' in stored.at(-1)!).toBe(false);
  });

  it('adds a texture dropped from the texture browser', () => {
    const { resources, stored } = tab(solidScriptDocumentCreate([]));
    const data = new Map<string, string>([[TEXTURE_BROWSER_DRAG_TYPE, 'tex-stone']]);
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', {
      value: { types: [...data.keys()], getData: (type: string) => data.get(type) ?? '', files: [] },
    });
    resources.element.dispatchEvent(drop);
    expect(stored.at(-1)?.resources).toEqual([{ name: 'Texture', kind: 'Texture', texture: 'tex-stone' }]);
  });
});
