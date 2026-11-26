import { CURVE_PRESETS_ARCHITECTURE } from '@/curve/model/curve_preset_architecture.js';
import { curvePresetCatalog } from '@/curve/model/curve_preset_catalog.js';
import { CURVE_PRESETS_EXTENDED } from '@/curve/model/curve_preset_extended.js';
import { CURVE_PRESETS_TURNERY } from '@/curve/model/curve_preset_turnery.js';
import { CurveField } from '@/curve/ui/curve_field.js';
import { MODIFIER_STACK_CURVE_MARKER_STYLE } from '@/modifier/stack/ui/modifier_stack_curve_row.js';
import { modifierStackUiText } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { PathField } from '@/path/ui/path_field.js';
import {
  solidScriptResourceCurve,
  solidScriptResourceCurveRead,
  type SolidScriptResource,
} from '@/solid_script/document/solid_script_resource.js';

/** Widest the details of a resource get, so fields stay compact. */
const SOLID_SCRIPT_RESOURCE_DETAIL_WIDTH = '420px';

/** What the details of a resource do with the user's changes. */
export interface SolidScriptEditorResourceDetailHooks {
  /** Stores the changed resource. */
  change: (resource: SolidScriptResource) => void;
  /** Gives the resource a new name; returns a problem, or empty when done. */
  rename: (name: string) => string;
}

/** The details of the selected resource, and how to open its editor. */
export interface SolidScriptEditorResourceDetail {
  /** Details element. */
  element: HTMLElement;
  /** Opens the curve editor of a curve; does nothing for others. */
  open: () => void;
  /** Puts the cursor in the name box. */
  rename: () => void;
}

/**
 * Builds the details of the selected resource: its name, how the script reads
 * it, and the curve or path editor.
 *
 * @param resource Resource.
 * @param hooks What the details do with changes.
 * @returns Details.
 */
export function solidScriptEditorResourceDetail(
  resource: SolidScriptResource,
  hooks: SolidScriptEditorResourceDetailHooks,
): SolidScriptEditorResourceDetail {
  const element = document.createElement('div');
  element.dataset['solidScriptResource'] = resource.name;
  Object.assign(element.style, { display: 'grid', gap: '6px', maxWidth: SOLID_SCRIPT_RESOURCE_DETAIL_WIDTH });
  const name = solidScriptEditorResourceName(resource.name, hooks.rename);
  const head = document.createElement('div');
  Object.assign(head.style, { display: 'flex', gap: '8px', alignItems: 'center' });
  head.append(name, modifierStackUiText('span', `Read it as [$Resources.${resource.name}]`));
  element.append(head);
  if (resource.kind === 'Path') element.append(solidScriptEditorResourcePath(resource, hooks.change));
  const curve = resource.kind === 'Curve' ? solidScriptEditorResourceCurve(resource, hooks.change) : null;
  if (curve) element.append(curve.getElement());
  return { element, open: () => curve?.open(), rename: () => name.select() };
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
  input.size = 16;
  input.style.maxWidth = '180px';
  input.setAttribute('aria-label', 'Resource name');
  input.addEventListener('change', () => {
    const problem = rename(input.value.trim());
    input.setCustomValidity(problem);
    if (problem !== '') input.reportValidity();
  });
  return input;
}

/**
 * Builds the path field of a path resource.
 *
 * @param resource Path resource.
 * @param change Stores the changed resource.
 * @returns Field element.
 */
function solidScriptEditorResourcePath(
  resource: Extract<SolidScriptResource, { kind: 'Path' }>,
  change: (resource: SolidScriptResource) => void,
): HTMLElement {
  const field = new PathField({ label: resource.name, onCommit: (path) => change({ ...resource, path }) });
  field.setPath(resource.path);
  return field.getElement();
}

/**
 * Builds the curve field of a curve resource, with every preset and the Base
 * and Top markers.
 *
 * @param resource Curve resource.
 * @param change Stores the changed resource.
 * @returns Curve field.
 */
function solidScriptEditorResourceCurve(
  resource: Extract<SolidScriptResource, { kind: 'Curve' }>,
  change: (resource: SolidScriptResource) => void,
): CurveField {
  const field = new CurveField({
    label: resource.name,
    presets: curvePresetCatalog([...CURVE_PRESETS_ARCHITECTURE, ...CURVE_PRESETS_TURNERY, ...CURVE_PRESETS_EXTENDED]),
    fileName: resource.name,
    onPreview: () => undefined,
    onCommit: (curve) => change(solidScriptResourceCurve(resource.name, curve)),
    markers: MODIFIER_STACK_CURVE_MARKER_STYLE,
  });
  const curve = solidScriptResourceCurveRead(resource);
  if (curve) field.setCurve(curve);
  return field;
}
