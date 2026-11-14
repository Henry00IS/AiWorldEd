import type { ModifierStackChoice, ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';

/**
 * Renames the volume wording of field captions and choices for a stack a brush
 * or CSG group owns, whose frame and box are the object itself.
 *
 * @param fields Field descriptions of a kind.
 * @returns Fields that say Object where they said Volume.
 */
export function modifierStackOwnerFields(fields: readonly ModifierStackField[]): ModifierStackField[] {
  return fields.map((field) => ({
    ...field,
    label: modifierStackOwnerWording(field.label),
    ...(field.choices ? { choices: field.choices.map(modifierStackOwnerChoice) } : {}),
    ...(field.hint ? { hint: modifierStackOwnerWording(field.hint) } : {}),
  }));
}

/**
 * Renames one choice.
 *
 * @param choice Stored choice.
 * @returns Choice with object wording.
 */
function modifierStackOwnerChoice(choice: ModifierStackChoice): ModifierStackChoice {
  return { ...choice, label: modifierStackOwnerWording(choice.label) };
}

/**
 * Replaces volume wording with object wording, keeping capitalisation.
 *
 * @param text Caption, label or hint.
 * @returns Reworded text.
 */
export function modifierStackOwnerWording(text: string): string {
  return text.replace(/\bVolume\b/g, 'Object').replace(/\bvolume\b/g, 'object');
}
