import { clipboardCollaborationButton } from '@/collaboration/ui/clipboard_collaboration_copy.js';
import { uiCollaborationSelect } from '@/collaboration/ui/ui_collaboration_select.js';
import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import {
  uiCollaborationButton,
  uiCollaborationButtons,
  uiCollaborationField,
  uiCollaborationInput,
  uiCollaborationSecretMask,
  uiCollaborationSecretMasked,
  uiCollaborationText,
  uiCollaborationTextSet,
} from '@/collaboration/ui/ui_collaboration_elements.js';
import { passwordGenerate } from '@/collaboration/shared/password_generator.js';
import {
  PASSWORD_LENGTH_MAXIMUM,
  passwordPolicyEvaluate,
  type PasswordPolicyIssue,
} from '@/collaboration/shared/password_policy.js';
import {
  fieldCollaborationDisplayNameFeedback,
  fieldCollaborationDisplayNameInput,
  fieldCollaborationDisplayNameValue,
} from '@/collaboration/ui/field_collaboration_display_name.js';
import { ROOM_NAME_LENGTH_MAXIMUM, roomNameNormalize } from '@/collaboration/shared/room_name_policy.js';
import { roomCollaborationDefaultName } from '@/collaboration/ui/room_collaboration_default_name.js';

/** Result of the create dialog. */
export interface DialogCollaborationCreateResult {
  name: string;
  displayName: string;
  private: boolean;
  password: string;
}

/** Explanation per password policy issue. */
const DIALOG_COLLABORATION_PASSWORD_TEXT: Readonly<Record<PasswordPolicyIssue, string>> = {
  too_short: 'at least 8 characters',
  too_long: 'at most 128 characters',
  invalid_characters: 'no spaces or control characters',
  missing_uppercase: 'an uppercase letter',
  missing_digit: 'a digit',
  missing_special: 'a special character',
  repeated_characters: 'no runs of the same character',
  sequence: 'no sequences like abcd or 1234',
  low_variety: 'more different characters',
  common_password: 'not a common password',
  low_entropy: 'more randomness',
};

/**
 * Returns live feedback for a password.
 *
 * @param password Candidate password.
 * @returns Ok flag and message.
 */
export function dialogCollaborationPasswordFeedback(password: string): { ok: boolean; text: string } {
  const result = passwordPolicyEvaluate(password);
  if (result.ok) return { ok: true, text: `Strong password (about ${Math.round(result.estimatedBits)} bits).` };
  const needs = result.issues.map((issue) => DIALOG_COLLABORATION_PASSWORD_TEXT[issue]);
  return { ok: false, text: `Needs: ${needs.join(', ')}.` };
}

/**
 * Returns live feedback for a room name.
 *
 * @param name Candidate name.
 * @returns Error text, or an empty string when valid.
 */
export function dialogCollaborationNameFeedback(name: string): string {
  const result = roomNameNormalize(name);
  if (result.ok) return '';
  if (result.reason === 'empty') return 'Enter a room name.';
  if (result.reason === 'too_long') return `Room names have at most ${ROOM_NAME_LENGTH_MAXIMUM} characters.`;
  return 'Room names cannot contain control characters.';
}

/** Dialog that creates a public or password-protected room. */
export class DialogCollaborationCreate extends DialogCollaborationBase<DialogCollaborationCreateResult> {
  private readonly name: HTMLInputElement;
  private readonly displayName: HTMLInputElement;
  private readonly visibility: HTMLSelectElement;
  private readonly password: HTMLInputElement;
  private readonly passwordRow: HTMLElement;
  private readonly policy: HTMLElement;
  private readonly createButton: HTMLButtonElement;
  private suggested: string;

  /**
   * Builds the dialog.
   *
   * @param host Modal host.
   * @param defaultName Suggested room name.
   * @param displayName Stored display name used as the default.
   */
  constructor(host: HTMLElement, defaultName: string, displayName: string) {
    super(host, 'Create room', 440);
    this.suggested = defaultName;
    this.displayName = fieldCollaborationDisplayNameInput(displayName);
    this.name = uiCollaborationInput(defaultName, ROOM_NAME_LENGTH_MAXIMUM, 'room-title');
    this.visibility = dialogCollaborationVisibility();
    this.password = uiCollaborationInput(passwordGenerate(), PASSWORD_LENGTH_MAXIMUM, 'room-key');
    uiCollaborationSecretMask(this.password, true);
    this.policy = uiCollaborationText('', 'muted');
    this.passwordRow = uiCollaborationField('Password', this.password, ...this.passwordTools());
    this.createButton = uiCollaborationButton('Create', true, () => this.submit());
    this.layout();
    this.bind();
    this.validate();
  }

  /** Appends the dialog rows. */
  private layout(): void {
    this.body.append(
      uiCollaborationText(
        'Your current scene is shared with everyone who joins. You own the room; closing it ends it.',
        'muted',
      ),
      uiCollaborationField('Your name', this.displayName),
      uiCollaborationField('Room name', this.name),
      uiCollaborationField('Visibility', this.visibility),
      this.policy,
      uiCollaborationButtons(
        uiCollaborationButton('Cancel', false, () => this.finish(null)),
        this.createButton,
      ),
    );
  }

  /**
   * Creates the reveal, regenerate and copy buttons.
   *
   * @returns Buttons.
   */
  private passwordTools(): HTMLButtonElement[] {
    const reveal = uiCollaborationButton('Show', false, () => {
      uiCollaborationSecretMask(this.password, !uiCollaborationSecretMasked(this.password));
      reveal.textContent = uiCollaborationSecretMasked(this.password) ? 'Show' : 'Hide';
    });
    const regenerate = uiCollaborationButton('New', false, () => this.regenerate());
    regenerate.title = 'Generate a new strong password';
    const copy = clipboardCollaborationButton(() => this.password.value, 'Copy the password to share it');
    [reveal, regenerate, copy].forEach((button) => (button.style.minWidth = '0'));
    return [reveal, regenerate, copy];
  }

  /** Wires live validation and Enter to submit. */
  private bind(): void {
    [this.displayName, this.name, this.password].forEach((input) =>
      input.addEventListener('input', () => this.validate()),
    );
    this.displayName.addEventListener('input', () => this.suggestionFollow());
    this.visibility.addEventListener('change', () => this.validate());
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submit();
    });
  }

  /**
   * Keeps the room name in step with the typed display name ("Henry's room")
   * while it still shows the previous suggestion, so a name the user typed is
   * never replaced.
   */
  private suggestionFollow(): void {
    if (this.name.value !== this.suggested) return;
    this.suggested = roomCollaborationDefaultName(fieldCollaborationDisplayNameValue(this.displayName.value));
    this.name.value = this.suggested;
    this.validate();
  }

  /** Replaces the password with a freshly generated one. */
  private regenerate(): void {
    this.password.value = passwordGenerate();
    this.validate();
  }

  /**
   * Updates feedback and the Create button. The password row is only in the
   * DOM, and its input only enabled, while Private is selected.
   *
   * @returns True when the form is valid.
   */
  private validate(): boolean {
    const isPrivate = this.visibility.value === 'private';
    if (isPrivate && !this.passwordRow.isConnected) this.visibility.parentElement?.after(this.passwordRow);
    if (!isPrivate) this.passwordRow.remove();
    this.password.disabled = !isPrivate;
    const nameError =
      fieldCollaborationDisplayNameFeedback(this.displayName.value) || dialogCollaborationNameFeedback(this.name.value);
    const password = dialogCollaborationPasswordFeedback(this.password.value);
    uiCollaborationTextSet(this.policy, isPrivate ? password.text : '', password.ok ? 'good' : 'bad');
    this.feedbackSet(nameError);
    const ok = nameError === '' && (!isPrivate || password.ok);
    this.createButton.disabled = !ok;
    this.createButton.style.opacity = ok ? '1' : '0.5';
    return ok;
  }

  /** Resolves with the form values when valid. */
  private submit(): void {
    if (!this.validate()) return;
    const isPrivate = this.visibility.value === 'private';
    this.finish({
      name: this.name.value.trim(),
      displayName: fieldCollaborationDisplayNameValue(this.displayName.value),
      private: isPrivate,
      password: isPrivate ? this.password.value : '',
    });
  }
}

/**
 * Creates the public/private selector.
 *
 * @returns Select element with Public selected.
 */
function dialogCollaborationVisibility(): HTMLSelectElement {
  return uiCollaborationSelect([
    { value: 'public', label: 'Public: listed, anyone can join' },
    { value: 'private', label: 'Private: listed, password required' },
  ]);
}
