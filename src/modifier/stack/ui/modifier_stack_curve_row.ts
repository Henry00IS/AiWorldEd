import { curveDecode, curveEncode } from '@/curve/model/curve_codec.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { CurveField } from '@/curve/ui/curve_field.js';
import type { ModifierStackField, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackFieldRow } from './modifier_stack_field_rows.js';
import { modifierStackUiRow } from './modifier_stack_ui_style.js';

/** Live preview and fallback curves of curve fields. */
export interface ModifierStackCurveHooks {
  /** Receives an encoded curve while the user drags in the editor. */
  onPreview?: (key: string, value: string) => void;
  /** Returns the encoded curve shown while a field stores none. */
  fallback?: (key: string, parameters: Record<string, unknown>) => string;
  /**
   * Returns the identity of a field's value, so a rebuilt row keeps its open
   * editor.
   */
  editorKey?: (key: string) => string;
}

/**
 * Creates a curve row: a preview strip that opens the curve editor. A field
 * that stores no curve shows its fallback, or a flat line at the top.
 *
 * @param field Curve field.
 * @param onCommit Receives the encoded curve.
 * @param hooks Preview and fallback hooks.
 * @returns Rendered field.
 */
export function modifierStackCurveRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
  hooks: ModifierStackCurveHooks,
): ModifierStackFieldRow {
  const input = new CurveField({
    label: field.label,
    presets: field.curvePresets ?? [],
    fileName: field.label.toLowerCase(),
    onPreview: (curve) => hooks.onPreview?.(field.key, curveEncode(curve)),
    onCommit: (curve) => onCommit(field.key, curveEncode(curve)),
    ...(hooks.editorKey ? { editorKey: hooks.editorKey(field.key) } : {}),
  });
  const write = (value: unknown, parameters: Record<string, unknown>): void => {
    const stored = curveDecode(value) ?? curveDecode(hooks.fallback?.(field.key, parameters));
    input.setCurve(
      stored ??
        curveFromPolyline([
          [0, 1],
          [1, 1],
        ]),
    );
  };
  return { field, row: modifierStackUiRow(field.label, input.getElement(), field.hint), write };
}
