import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import {
  fieldCollaborationDisplayNameFeedback,
  fieldCollaborationDisplayNameInput,
  fieldCollaborationDisplayNameValue,
} from '@/collaboration/ui/field_collaboration_display_name.js';
import {
  uiCollaborationButton,
  uiCollaborationButtons,
  uiCollaborationField,
  uiCollaborationInput,
  uiCollaborationSecretMask,
  uiCollaborationText,
} from '@/collaboration/ui/ui_collaboration_elements.js';
import { PASSWORD_LENGTH_MAXIMUM } from '@/collaboration/shared/password_policy.js';

/** Result of the join dialog. */
export interface DialogCollaborationJoinResult {
  displayName: string;
  password: string;
}

/** Room shown by the join dialog. */
export interface DialogCollaborationJoinRoom {
  name: string;
  private: boolean;
}

/** Asks for the display name and, for private rooms, the password. */
export class DialogCollaborationJoin extends DialogCollaborationBase<DialogCollaborationJoinResult> {
  private readonly displayName: HTMLInputElement;
  private readonly password: HTMLInputElement | null;

  /**
   * Builds the dialog.
   *
   * @param host Modal host.
   * @param room Room being joined.
   * @param displayName Stored display name used as the default.
   * @param error Error of the previous attempt, if any.
   */
  constructor(host: HTMLElement, room: DialogCollaborationJoinRoom, displayName: string, error: string) {
    super(host, room.private ? 'Join private room' : 'Join room', 400);
    this.displayName = fieldCollaborationDisplayNameInput(displayName);
    this.password = room.private ? uiCollaborationInput('', PASSWORD_LENGTH_MAXIMUM, 'room-key') : null;
    if (this.password !== null) uiCollaborationSecretMask(this.password, true);
    const intro = room.private ? `"${room.name}" is private. Enter its password.` : `Join "${room.name}".`;
    const passwordRow = this.password === null ? [] : [uiCollaborationField('Password', this.password)];
    this.body.append(
      uiCollaborationText(intro, 'muted'),
      uiCollaborationField('Your name', this.displayName),
      ...passwordRow,
      uiCollaborationButtons(
        uiCollaborationButton('Cancel', false, () => this.finish(null)),
        uiCollaborationButton('Join', true, () => this.submit()),
      ),
    );
    this.feedbackSet(error);
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submit();
    });
  }

  /** Resolves with the typed name and password when valid. */
  private submit(): void {
    const nameError = fieldCollaborationDisplayNameFeedback(this.displayName.value);
    if (nameError !== '') return this.feedbackSet(nameError);
    if (this.password !== null && this.password.value === '') return this.feedbackSet('Enter the password.');
    this.finish({
      displayName: fieldCollaborationDisplayNameValue(this.displayName.value),
      password: this.password?.value ?? '',
    });
  }
}
