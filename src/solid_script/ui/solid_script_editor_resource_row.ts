import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { curvePresetCatalog } from '@/curve/model/curve_preset_catalog.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { CurveField } from '@/curve/ui/curve_field.js';
import { modifierStackUiTextButton } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { PathField } from '@/path/ui/path_field.js';
import {
  solidScriptResourceCurve,
  solidScriptResourceCurveRead,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';
import { textureSelectCreate } from '@/texture/ui/texture_select.js';

/** What a resource row does with the user's changes. */
export interface SolidScriptEditorResourceRowHooks {
  /** Stores the changed resource. */
  change: (resource: SolidScriptResource) => void;
  /** Gives the resource a new name; returns a problem, or empty when done. */
  rename: (name: string) => string;
  /** Takes the resource out of the script. */
  remove: () => void;
}

/**
 * Builds the row of one resource: its kind, its name as scripts read it after
 * $Resource., its editor and a Remove button.
 *
 * @param resource Resource.
 * @param hooks What the row does with changes.
 * @returns Row.
 */
export function solidScriptEditorResourceRow(
  resource: SolidScriptResource,
  hooks: SolidScriptEditorResourceRowHooks,
): HTMLElement {
  const row = document.createElement('div');
  row.dataset['solidScriptResource'] = resource.name;
  Object.assign(row.style, { display: 'grid', gap: '4px', paddingBottom: '6px' });
  const head = document.createElement('div');
  Object.assign(head.style, { display: 'flex', gap: '6px', alignItems: 'center' });
  const kind = document.createElement('span');
  kind.textContent = resource.kind;
  head.append(kind, solidScriptEditorResourceName(resource.name, hooks.rename));
  head.append(modifierStackUiTextButton('Remove', `Remove ${resource.name} from the script`, () => hooks.remove()));
  row.append(head, solidScriptEditorResourceEditor(resource, hooks.change));
  return row;
}

/**
 * Builds the name box of a resource, which renames it when changed.
 *
 * @param name Current name.
 * @param rename Renames; returns a problem, or empty.
 * @returns Name box.
 */
function solidScriptEditorResourceName(name: string, rename: (name: string) => string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = name;
  input.setAttribute('aria-label', 'Resource name');
  input.title = `Read it in the script as [$Resource.${name}]`;
  input.addEventListener('change', () => {
    const problem = rename(input.value.trim());
    input.setCustomValidity(problem);
    if (problem !== '') input.reportValidity();
  });
  return input;
}

/**
 * Builds the editor of a resource: the curve editor, the path field or the
 * texture picker.
 *
 * @param resource Resource.
 * @param change Stores the changed resource.
 * @returns Editor.
 */
function solidScriptEditorResourceEditor(
  resource: SolidScriptResource,
  change: (resource: SolidScriptResource) => void,
): HTMLElement {
  if (resource.kind === 'Texture') {
    const select = textureSelectCreate(resource.name, (texture) => change({ ...resource, texture }));
    select.write(resource.texture);
    return select.element;
  }
  if (resource.kind === 'Path') {
    const field = new PathField({ label: resource.name, onCommit: (path) => change({ ...resource, path }) });
    field.setPath(resource.path);
    return field.getElement();
  }
  const field = new CurveField({
    label: resource.name,
    presets: curvePresetCatalog([...CURVE_PRESETS_ARCHITECTURE, ...CURVE_PRESETS_TURNERY, ...CURVE_PRESETS_EXTENDED]),
    fileName: resource.name,
    onPreview: () => undefined,
    onCommit: (curve) => change(solidScriptResourceCurve(resource.name, curve)),
  });
  const curve = solidScriptResourceCurveRead(resource);
  if (curve) field.setCurve(curve);
  return field.getElement();
}
