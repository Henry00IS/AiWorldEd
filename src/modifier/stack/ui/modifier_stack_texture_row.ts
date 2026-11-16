import { textureSelectCreate } from '@/texture/ui/texture_select.js';
import type { ModifierStackField, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackFieldRow } from './modifier_stack_field_rows.js';
import { modifierStackUiRow } from './modifier_stack_ui_style.js';

/**
 * Creates a texture picker like the bevel's: Default, then every library
 * texture. A stored id missing from the library stays visible as missing.
 *
 * @param field Texture field.
 * @param onCommit Receives the picked id, or empty for the default.
 * @returns Rendered field.
 */
export function modifierStackTextureRow(
  field: ModifierStackField,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  const select = textureSelectCreate(field.label, (id) => onCommit(field.key, id));
  const write = (value: unknown): void => select.write(typeof value === 'string' ? value : '');
  return { field, row: modifierStackUiRow(field.label, select.element, field.hint), write };
}
