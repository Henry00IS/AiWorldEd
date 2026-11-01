import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import {
  uiCollaborationButton,
  uiCollaborationButtons,
  uiCollaborationField,
  uiCollaborationInput,
  uiCollaborationText,
} from '@/collaboration/ui/ui_collaboration_elements.js';
import { configCollaborationUrlValid } from '@/collaboration/config/config_collaboration_server.js';
import { DISPLAY_NAME_LENGTH_MAXIMUM, displayNameNormalize } from '@/collaboration/shared/room_name_policy.js';

/** Result of the settings dialog. */
export interface DialogCollaborationSettingsResult {
  url: string;
  name: string;
}

/** Edits the relay URL and the display name. */
export class DialogCollaborationSettings extends DialogCollaborationBase<DialogCollaborationSettingsResult> {
  private readonly url: HTMLInputElement;
  private readonly name: HTMLInputElement;
  private readonly fallback: string;

  /**
   * Builds the dialog.
   *
   * @param host Modal host.
   * @param current Current values.
   * @param fallback Default URL used when the field is cleared.
   */
  constructor(host: HTMLElement, current: DialogCollaborationSettingsResult, fallback: string) {
    super(host, 'Collaboration settings', 460);
    this.fallback = fallback;
    this.url = uiCollaborationInput(current.url, 2048, 'server-url');
    this.url.placeholder = fallback;
    this.name = uiCollaborationInput(current.name, DISPLAY_NAME_LENGTH_MAXIMUM, 'display-name');
    this.name.placeholder = 'Shown to other users';
    this.body.append(
      uiCollaborationField('Server URL', this.url),
      uiCollaborationText(`Leave empty for the default (${fallback}). Changes apply on the next connection.`, 'muted'),
      uiCollaborationField('Your name', this.name),
      uiCollaborationButtons(
        uiCollaborationButton('Cancel', false, () => this.finish(null)),
        uiCollaborationButton('Save', true, () => this.submit()),
      ),
    );
    this.root.addEventListener('keydown', (event) => this.keyHandle(event));
  }

  /**
   * Saves on Enter, like the other online dialogs.
   *
   * @param event Key event inside the dialog.
   */
  private keyHandle(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    this.submit();
  }

  /** Validates and resolves. */
  private submit(): void {
    const url = this.url.value.trim();
    if (url !== '' && !configCollaborationUrlValid(url)) return this.feedbackSet('Use a ws:// or wss:// URL.');
    const name = this.name.value.trim();
    if (name !== '' && !displayNameNormalize(name).ok) return this.feedbackSet('That name is not allowed.');
    this.finish({ url: url === this.fallback ? '' : url, name });
  }
}
