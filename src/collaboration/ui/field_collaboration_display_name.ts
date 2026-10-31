import { uiCollaborationInput } from '@/collaboration/ui/ui_collaboration_elements.js';
import { DISPLAY_NAME_LENGTH_MAXIMUM, displayNameNormalize } from '@/collaboration/shared/room_name_policy.js';

/**
 * Creates the "Your name" input of the create and join dialogs.
 *
 * @param value Stored name used as the default.
 * @returns Input element.
 */
export function fieldCollaborationDisplayNameInput(value: string): HTMLInputElement {
  const input = uiCollaborationInput(value, DISPLAY_NAME_LENGTH_MAXIMUM);
  input.placeholder = `Shown to others, ${DISPLAY_NAME_LENGTH_MAXIMUM} characters at most`;
  return input;
}

/**
 * Returns live feedback for a display name.
 *
 * @param name Candidate name.
 * @returns Error text, or an empty string when valid.
 */
export function fieldCollaborationDisplayNameFeedback(name: string): string {
  const result = displayNameNormalize(name);
  if (result.ok) return '';
  if (result.reason === 'empty') return 'Enter your name.';
  if (result.reason === 'too_long') return `Names have at most ${DISPLAY_NAME_LENGTH_MAXIMUM} characters.`;
  return 'Names cannot contain control characters.';
}

/**
 * Returns the normalized display name of a valid input.
 *
 * @param name Typed name.
 * @returns Trimmed name, or an empty string when invalid.
 */
export function fieldCollaborationDisplayNameValue(name: string): string {
  const result = displayNameNormalize(name);
  return result.ok ? result.name : '';
}
