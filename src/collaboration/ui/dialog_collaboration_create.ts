import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import {
  uiCollaborationButton,
  uiCollaborationButtons,
  uiCollaborationField,
  uiCollaborationInput,
  uiCollaborationText,
  uiCollaborationTextSet,
} from '@/collaboration/ui/ui_collaboration_elements.js';
import { passwordGenerate } from '@/collaboration/shared/password_generator.js';
import {
  PASSWORD_LENGTH_MAXIMUM,
  passwordPolicyEvaluate,
  type PasswordPolicyIssue,
} from '@/collaboration/shared/password_policy.js';
import { ROOM_NAME_LENGTH_MAXIMUM, roomNameNormalize } from '@/collaboration/shared/room_name_policy.js';

/** Result of the create dialog. */
export interface DialogCollaborationCreateResult {
  name: string;
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
  private readonly visibility: HTMLSelectElement;
  private readonly password: HTMLInputElement;
  private readonly passwordRow: HTMLElement;
  private readonly policy: HTMLElement;
  private readonly createButton: HTMLButtonElement;

  /**
   * Builds the dialog.
   *
   * @param host Modal host.
   * @param defaultName Suggested room name.
   */
  constructor(host: HTMLElement, defaultName: string) {
    super(host, 'Create room', 440);
    this.name = uiCollaborationInput(defaultName, ROOM_NAME_LENGTH_MAXIMUM);
    this.visibility = dialogCollaborationVisibility();
    this.password = uiCollaborationInput(passwordGenerate(), PASSWORD_LENGTH_MAXIMUM, 'password');
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
      uiCollaborationField('Room name', this.name),
      uiCollaborationField('Visibility', this.visibility),
      this.passwordRow,
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
      this.password.type = this.password.type === 'password' ? 'text' : 'password';
      reveal.textContent = this.password.type === 'password' ? 'Show' : 'Hide';
    });
    const regenerate = uiCollaborationButton('New', false, () => this.regenerate());
    regenerate.title = 'Generate a new strong password';
    const copy = uiCollaborationButton('Copy', false, () => void navigator.clipboard?.writeText(this.password.value));
    [reveal, regenerate, copy].forEach((button) => (button.style.minWidth = '0'));
    return [reveal, regenerate, copy];
  }

  /** Wires live validation and Enter to submit. */
  private bind(): void {
    [this.name, this.password].forEach((input) => input.addEventListener('input', () => this.validate()));
    this.visibility.addEventListener('change', () => this.validate());
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submit();
    });
  }

  /** Replaces the password with a freshly generated one. */
  private regenerate(): void {
    this.password.value = passwordGenerate();
    this.validate();
  }

  /**
   * Updates feedback and the Create button.
   *
   * @returns True when the form is valid.
   */
  private validate(): boolean {
    const isPrivate = this.visibility.value === 'private';
    this.passwordRow.style.display = isPrivate ? 'flex' : 'none';
    const nameError = dialogCollaborationNameFeedback(this.name.value);
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
    this.finish({ name: this.name.value.trim(), private: isPrivate, password: isPrivate ? this.password.value : '' });
  }
}

/**
 * Creates the public/private selector.
 *
 * @returns Select element.
 */
function dialogCollaborationVisibility(): HTMLSelectElement {
  const select = document.createElement('select');
  [
    ['public', 'Public: listed, anyone can join'],
    ['private', 'Private: listed, password required'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value ?? '';
    option.textContent = label ?? '';
    select.appendChild(option);
  });
  select.style.flex = '1';
  select.style.padding = '5px 6px';
  select.style.background = 'rgba(0,0,0,0.35)';
  select.style.color = '#f0f0f0';
  select.style.border = '1px solid rgba(255,255,255,0.14)';
  select.style.borderRadius = '5px';
  return select;
}
