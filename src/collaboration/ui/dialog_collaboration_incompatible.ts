import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { DialogCollaborationBase } from '@/collaboration/ui/dialog_collaboration_base.js';
import { uiCollaborationButton, uiCollaborationText } from '@/collaboration/ui/ui_collaboration_elements.js';
import { compatibilityHomeUrl } from '@/collaboration/shared/compatibility_identity.js';

/** Shows a denial and an optional, explicitly untrusted owner-editor link. */
export class DialogCollaborationIncompatible extends DialogCollaborationBase<void> {
  /**
   * Builds a refusal without interpreting any owner content as HTML.
   *
   * @param host Modal host.
   * @param message Safe refusal explanation.
   * @param homeUrl Untrusted owner-supplied editor URL.
   */
  constructor(host: HTMLElement, message: string, homeUrl?: string) {
    super(host, 'Could Not Join the Room', 460);
    this.body.append(uiCollaborationText(message));
    const url = compatibilityHomeUrl(homeUrl);
    if (url) this.linkAppend(url);
    this.body.append(uiCollaborationButton('Close', true, () => this.finish(undefined)));
  }

  /**
   * Adds a plain URL and an opt-in link identifying its untrusted source.
   *
   * @param url Validated bounded HTTP(S) URL.
   */
  private linkAppend(url: string): void {
    this.body.append(
      uiCollaborationText(
        'The room owner suggests opening or installing their editor. This link is supplied by the room owner:',
        'muted',
      ),
      uiCollaborationText(url, 'muted'),
    );
    const link = document.createElement('a');
    link.href = url;
    link.textContent = "Open the room owner's editor";
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.color = hexToRgb(Theme.selectionColor);
    link.style.display = 'block';
    link.style.marginBottom = '12px';
    this.body.append(link);
  }
}
