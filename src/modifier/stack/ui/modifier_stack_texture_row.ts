import { InputSelect } from '@/ui/input/input_select.js';
import { textureChoicesList } from '@/texture/library/texture_choices.js';
import type { ModifierStackField, ModifierStackValue } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackFieldRow } from './modifier_stack_field_rows.js';
import { modifierStackUiRow } from './modifier_stack_ui_style.js';

/** Select value of the default checker texture. */
const MODIFIER_STACK_TEXTURE_DEFAULT = 'default';

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
  const input = new InputSelect([], field.label);
  if (typeof field.default === 'string' && field.default !== '')
    return modifierStackLibraryTextureRow(field, input, onCommit);
  input.bindCommit(() => {
    const value = input.getValue();
    onCommit(field.key, value === MODIFIER_STACK_TEXTURE_DEFAULT ? '' : value);
  });
  const write = (value: unknown): void => {
    const id = typeof value === 'string' ? value : '';
    input.setChoices([{ value: MODIFIER_STACK_TEXTURE_DEFAULT, label: 'Default' }, ...textureChoicesList([id])]);
    input.setSharedValues([id === '' ? MODIFIER_STACK_TEXTURE_DEFAULT : id]);
  };
  return { field, row: modifierStackUiRow(field.label, input.getElement(), field.hint), write };
}

/**
 * Fills a texture picker with exactly the texture library's list, the one the
 * bevel picker shows, for a field whose default is a library texture such as
 * the Checker; it has no extra Default entry.
 *
 * @param field Texture field with a library id as default.
 * @param input Select to fill.
 * @param onCommit Receives the picked id.
 * @returns Rendered field.
 */
function modifierStackLibraryTextureRow(
  field: ModifierStackField,
  input: InputSelect,
  onCommit: (key: string, value: ModifierStackValue) => void,
): ModifierStackFieldRow {
  input.bindCommit(() => onCommit(field.key, input.getValue()));
  const write = (value: unknown): void => {
    const id = typeof value === 'string' && value !== '' ? value : String(field.default);
    input.setChoices(textureChoicesList([id]));
    input.setSharedValues([id]);
  };
  return { field, row: modifierStackUiRow(field.label, input.getElement(), field.hint), write };
}
