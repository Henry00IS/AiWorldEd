import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import {
  uiCollaborationButton,
  uiCollaborationButtons,
  uiCollaborationField,
  uiCollaborationInput,
  uiCollaborationText,
} from '@/collaboration/ui/ui_collaboration_elements.js';
import { PASSWORD_LENGTH_MAXIMUM } from '@/collaboration/shared/password_policy.js';

/** Asks for the password of a private room. */
export class DialogCollaborationPassword extends DialogCollaborationBase<string> {
  private readonly password: HTMLInputElement;

  /**
   * Builds the dialog.
   *
   * @param host Modal host.
   * @param roomName Room being joined.
   * @param error Error of the previous attempt, if any.
   */
  constructor(host: HTMLElement, roomName: string, error: string) {
    super(host, 'Join private room', 400);
    this.password = uiCollaborationInput('', PASSWORD_LENGTH_MAXIMUM, 'password');
    this.body.append(
      uiCollaborationText(`"${roomName}" is private. Enter its password.`, 'muted'),
      uiCollaborationField('Password', this.password),
      uiCollaborationButtons(
        uiCollaborationButton('Cancel', false, () => this.finish(null)),
        uiCollaborationButton('Join', true, () => this.submit()),
      ),
    );
    this.feedbackSet(error);
    this.password.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.submit();
    });
  }

  /** Resolves with the typed password. */
  private submit(): void {
    if (this.password.value === '') return this.feedbackSet('Enter the password.');
    this.finish(this.password.value);
  }
}
