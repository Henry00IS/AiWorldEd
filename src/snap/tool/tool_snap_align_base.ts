import { Tool } from '@/editor/tools/tool.js';
import type { SnapAlignChromeId } from './snap_align_chrome_id.js';
import type { SnapAlignHost } from './snap_align_host.js';

/**
 * Single-use align tool. Busy until commit or Escape, then returns to the
 * parent.
 */
export abstract class ToolSnapAlignBase extends Tool {
  private finished: boolean;
  private alignChromeOpen: boolean;

  /** Creates an unfinished single-use session. */
  constructor() {
    super();
    this.finished = false;
    this.alignChromeOpen = false;
  }

  /**
   * Returns whether this tool still owns pointer and keyboard input.
   *
   * @returns True until commit or cancel.
   */
  override isBusy(): boolean {
    return this.isSingleUse && !this.finished;
  }

  /**
   * Cancels on Escape and returns to the parent tool.
   *
   * @param keyCode Key code.
   * @param _event Keyboard event.
   * @returns True when Escape was handled.
   */
  override onKeyDown(keyCode: string, _event?: KeyboardEvent): boolean {
    if (keyCode !== 'Escape') {
      return false;
    }
    this.cancelSession();
    this.returnToParent();
    return true;
  }

  /** Marks the session finished and activates the parent tool. */
  protected returnToParent(): void {
    this.finished = true;
    this.closeAlignChrome();
    const parent = this.parent;
    if (parent) {
      this.editor?.switchTool(parent);
    }
  }

  /**
   * Hides bounds widgets and highlights the options-bar button.
   *
   * @param which Active align tool.
   */
  protected openAlignChrome(which: SnapAlignChromeId): void {
    const host = this.readHost();
    if (!host) {
      return;
    }
    host.beginAlignChrome(which);
    this.alignChromeOpen = true;
  }

  /** Restores the widgets that were hidden for this session. */
  protected closeAlignChrome(): void {
    if (!this.alignChromeOpen) {
      return;
    }
    this.alignChromeOpen = false;
    this.readHost()?.endAlignChrome();
  }

  /**
   * Reads the align host from the editor.
   *
   * @returns Host, or null when the editor has no align services.
   */
  protected readHost(): SnapAlignHost | null {
    const services = this.editor?.getServices();
    if (!services?.getSnapAlignHost) {
      return null;
    }
    return services.getSnapAlignHost();
  }

  /** Restores any preview pose before the tool is left. */
  protected abstract cancelSession(): void;
}
