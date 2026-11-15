import type { ModifierStackActionTarget, ModifierStackField } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackFieldRow } from './modifier_stack_field_rows.js';
import { modifierStackUiText, modifierStackUiTextButton } from './modifier_stack_ui_style.js';

/** Builds the target an action button acts on, given the status line writer. */
export type ModifierStackActionTargetFactory = (status: (text: string) => void) => ModifierStackActionTarget | null;

/**
 * Creates the row of an action field: a full-width button that runs the field's
 * action, disabled while the action runs, with a status line below.
 *
 * @param field Action field.
 * @param targetOf Builds the action target, or returns null when there is none.
 * @returns Rendered field.
 */
export function modifierStackActionRow(
  field: ModifierStackField,
  targetOf: ModifierStackActionTargetFactory,
): ModifierStackFieldRow {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', flexDirection: 'column', gap: '3px', padding: '3px 0' });
  const status = modifierStackUiText('div', '', true);
  const writeStatus = (text: string): void => {
    status.textContent = text;
    status.style.display = text ? '' : 'none';
  };
  writeStatus('');
  const state = { running: false, unavailable: false };
  const button = modifierStackUiTextButton(field.label, field.hint ?? field.label, () => {
    const target = state.running || state.unavailable ? null : targetOf(writeStatus);
    if (target) void modifierStackActionRun(field, target, button, state);
  });
  row.append(button, status);
  const write = (_value: unknown, parameters: Record<string, unknown>): void => {
    state.unavailable = field.actionDisabled?.(parameters) ?? false;
    button.disabled = state.running || state.unavailable;
  };
  return { field, row, write };
}

/**
 * Runs an action with its button disabled until the action settles.
 *
 * @param field Action field.
 * @param target Action target.
 * @param button Button to disable meanwhile.
 * @param state Running and unavailable flags of the row.
 */
async function modifierStackActionRun(
  field: ModifierStackField,
  target: ModifierStackActionTarget,
  button: HTMLButtonElement,
  state: { running: boolean; unavailable: boolean },
): Promise<void> {
  state.running = true;
  button.disabled = true;
  try {
    await field.action?.(target);
  } catch (error) {
    target.status(error instanceof Error ? error.message : String(error));
  } finally {
    state.running = false;
    button.disabled = state.unavailable;
    target.refresh?.();
  }
}
