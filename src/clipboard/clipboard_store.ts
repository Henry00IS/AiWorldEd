import { clipboardTextCopy } from './clipboard_text_copy.js';
import { clipboardPayloadParse, clipboardPayloadText, type ClipboardPayloadType } from './clipboard_payload.js';

/**
 * Editor clipboard: writes every payload to the system clipboard and keeps an
 * in-app copy, which pastes only when the system clipboard could not be written
 * or read.
 */
export class ClipboardStore {
  private text: string | null = null;
  private systemHolds = false;

  /**
   * Copies content from a menu action.
   *
   * @param type Content type.
   * @param data Content.
   * @returns Resolves once the system clipboard was tried.
   */
  async write<T>(type: ClipboardPayloadType, data: T): Promise<void> {
    const text = clipboardPayloadText(type, data);
    this.text = text;
    this.systemHolds = false;
    const copied = await clipboardTextCopy(text);
    if (this.text === text) this.systemHolds = copied;
  }

  /**
   * Copies content inside a native copy event, such as Ctrl+C.
   *
   * @param event Copy event.
   * @param type Content type.
   * @param data Content.
   */
  writeEvent<T>(event: ClipboardEvent, type: ClipboardPayloadType, data: T): void {
    const text = clipboardPayloadText(type, data);
    this.text = text;
    this.systemHolds = !!event.clipboardData;
    event.clipboardData?.setData('text/plain', text);
    event.preventDefault();
  }

  /**
   * Reads content from a native paste event, such as Ctrl+V.
   *
   * @param event Paste event.
   * @param type Wanted content type.
   * @returns Content, or null.
   */
  readEvent<T>(event: ClipboardEvent, type: ClipboardPayloadType): T | null {
    const system = clipboardPayloadParse<T>(event.clipboardData?.getData('text/plain'), type);
    return system ?? this.fallback<T>(type);
  }

  /**
   * Reads content for a menu action: the system clipboard when the browser
   * allows it, otherwise the in-app copy.
   *
   * @param type Wanted content type.
   * @returns Content, or null.
   */
  async read<T>(type: ClipboardPayloadType): Promise<T | null> {
    try {
      const text = await navigator.clipboard?.readText();
      const system = clipboardPayloadParse<T>(text, type);
      if (system !== null) return system;
    } catch {
      return clipboardPayloadParse<T>(this.text, type);
    }
    return this.fallback<T>(type);
  }

  /**
   * Returns whether the in-app copy holds a type, for menu states.
   *
   * @param type Content type.
   * @returns True when it does.
   */
  holds(type: ClipboardPayloadType): boolean {
    return clipboardPayloadParse(this.text, type) !== null;
  }

  /**
   * Returns the in-app copy of a type, for menu states.
   *
   * @param type Content type.
   * @returns Content, or null.
   */
  peek<T>(type: ClipboardPayloadType): T | null {
    return clipboardPayloadParse<T>(this.text, type);
  }

  /**
   * Returns whether the in-app copy holds nothing, so a menu cannot tell what
   * another window may have copied.
   *
   * @returns True when empty.
   */
  empty(): boolean {
    return this.text === null;
  }

  /**
   * Returns the in-app copy unless the system clipboard took it.
   *
   * @param type Wanted content type.
   * @returns Content, or null.
   */
  private fallback<T>(type: ClipboardPayloadType): T | null {
    return this.systemHolds ? null : clipboardPayloadParse<T>(this.text, type);
  }

  /** Forgets the in-app copy. */
  clear(): void {
    this.text = null;
    this.systemHolds = false;
  }
}

/** The editor-wide clipboard. */
export const clipboardStore = new ClipboardStore();
