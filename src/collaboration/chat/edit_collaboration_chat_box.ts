import { Theme } from '@/theme.js';

/** Tallest the edit field grows before it scrolls. */
const EDIT_COLLABORATION_CHAT_BOX_HEIGHT_MAXIMUM_PX = 160;

/** What the inline editor reports. */
export interface EditCollaborationChatBoxHandlers {
  /**
   * The user asked to save.
   *
   * @param text Raw field text.
   */
  save(text: string): void;
  /** The user asked to stop editing without saving. */
  cancel(): void;
}

/**
 * Inline editor that takes the place of a message's text while it is edited:
 * Enter saves, Shift+Enter adds a line, Escape cancels.
 */
export class EditCollaborationChatBox {
  readonly element: HTMLElement;
  readonly field: HTMLTextAreaElement;
  private readonly notice: HTMLElement;
  private readonly handlers: EditCollaborationChatBoxHandlers;

  /**
   * Creates the editor filled with the current text.
   *
   * @param text Current message text.
   * @param handlers Save and cancel callbacks.
   */
  constructor(text: string, handlers: EditCollaborationChatBoxHandlers) {
    this.handlers = handlers;
    this.field = editCollaborationChatBoxField(text);
    this.notice = editCollaborationChatBoxNotice();
    this.element = document.createElement('div');
    this.element.className = 'editor-chat-edit';
    this.element.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:2px 0 4px';
    this.element.append(this.field, this.hint(), this.notice);
    this.field.addEventListener('keydown', (event) => this.keyHandle(event));
    this.field.addEventListener('input', () => this.fit());
  }

  /** Focuses the field with the caret at the end. */
  focus(): void {
    this.field.focus();
    this.field.setSelectionRange(this.field.value.length, this.field.value.length);
    this.fit();
  }

  /**
   * Locks the field while the relay answers.
   *
   * @param busy True while saving.
   */
  busySet(busy: boolean): void {
    this.field.disabled = busy;
    if (!busy) this.field.focus();
  }

  /**
   * Explains why the edit was refused; an empty text hides the line.
   *
   * @param text Explanation.
   */
  noticeSet(text: string): void {
    this.notice.textContent = text;
    this.notice.style.display = text === '' ? 'none' : 'block';
  }

  /**
   * Saves on Enter and cancels on Escape; other keys stay in the field.
   *
   * @param event Key event.
   */
  private keyHandle(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.handlers.cancel();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handlers.save(this.field.value);
    }
  }

  /** Grows the field with its text. */
  private fit(): void {
    this.field.style.height = 'auto';
    this.field.style.height = `${Math.min(EDIT_COLLABORATION_CHAT_BOX_HEIGHT_MAXIMUM_PX, this.field.scrollHeight + 2)}px`;
  }

  /**
   * Creates the key hint with clickable Cancel and Save.
   *
   * @returns Hint line.
   */
  private hint(): HTMLElement {
    const hint = document.createElement('div');
    hint.className = 'editor-chat-edit-hint';
    hint.style.cssText = `font-size:11px;line-height:15px;color:${Theme.statusBarTextColor}`;
    const cancel = editCollaborationChatBoxAction('Cancel', () => this.handlers.cancel());
    const save = editCollaborationChatBoxAction('Save', () => this.handlers.save(this.field.value));
    hint.append('Escape to ', cancel, ' \u2022 Enter to ', save);
    return hint;
  }
}

/**
 * Creates the edit field.
 *
 * @param text Initial text.
 * @returns Field.
 */
function editCollaborationChatBoxField(text: string): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  field.className = 'editor-chat-edit-field';
  field.rows = 1;
  field.value = text;
  field.spellcheck = true;
  field.setAttribute('aria-label', 'Edit message');
  field.setAttribute('data-1p-ignore', '');
  field.setAttribute('data-lpignore', 'true');
  field.style.cssText = `display:block;width:100%;box-sizing:border-box;resize:none;min-height:36px;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.14);background:rgba(0,0,0,0.35);color:#f0f0f0;font-size:13px;line-height:18px;font-family:${Theme.uiFontFamily};overflow-x:hidden;overflow-y:auto;white-space:pre-wrap`;
  return field;
}

/**
 * Creates a link-styled action of the key hint.
 *
 * @param label Action label.
 * @param run Runs the action.
 * @returns Button.
 */
function editCollaborationChatBoxAction(label: string, run: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `editor-chat-edit-${label.toLowerCase()}`;
  button.textContent = label;
  button.style.cssText = 'padding:0;border:none;background:none;cursor:pointer;font:inherit;color:#6cb6ff';
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', run);
  return button;
}

/**
 * Creates the line that explains a refused edit.
 *
 * @returns Hidden notice.
 */
function editCollaborationChatBoxNotice(): HTMLElement {
  const notice = document.createElement('div');
  notice.className = 'editor-chat-edit-notice';
  notice.setAttribute('role', 'alert');
  notice.style.cssText = 'display:none;font-size:11px;line-height:15px;color:#ff6b6b';
  return notice;
}
