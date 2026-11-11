import type { EntryCollaborationChat } from '@/collaboration/chat/entry_collaboration_chat.js';

/** How often the shown actions are checked again while a row is hovered. */
const ACTIONS_COLLABORATION_CHAT_RECHECK_MS = 1000;

/** One action offered on a hovered message. */
export interface ActionsCollaborationChatAction {
  /** Title Case name, used as tooltip and accessible label. */
  label: string;
  /** SVG path data drawn in a 16 by 16 box. */
  icon: string;
  /**
   * Returns whether the action applies to a message right now.
   *
   * @param entry Hovered message.
   * @returns True to offer it.
   */
  shown(entry: EntryCollaborationChat): boolean;
  /**
   * Runs the action.
   *
   * @param entry Hovered message.
   */
  run(entry: EntryCollaborationChat): void;
}

/**
 * The small toolbar that floats over the top right of the hovered message. One
 * toolbar moves between rows; actions that stop applying (e.g. an edit window
 * that ran out) disappear while hovered.
 */
export class ActionsCollaborationChat {
  readonly element: HTMLElement;
  private actions: readonly ActionsCollaborationChatAction[];
  private entry: EntryCollaborationChat | null;
  private shownLabels: string | null;
  private timer: ReturnType<typeof setInterval> | null;

  /** Creates the detached toolbar. */
  constructor() {
    this.actions = [];
    this.entry = null;
    this.shownLabels = null;
    this.timer = null;
    this.element = document.createElement('div');
    this.element.className = 'editor-chat-actions';
    this.element.setAttribute('role', 'toolbar');
    this.element.style.cssText =
      'position:absolute;top:-14px;right:14px;z-index:1;display:flex;gap:2px;padding:2px;border-radius:6px;background:#2b2d31;border:1px solid rgba(255,255,255,0.1);box-shadow:0 2px 8px rgba(0,0,0,0.45)';
  }

  /**
   * Sets the actions offered on messages.
   *
   * @param actions Actions in toolbar order.
   */
  actionsSet(actions: readonly ActionsCollaborationChatAction[]): void {
    this.actions = actions;
  }

  /**
   * Shows the toolbar on a row.
   *
   * @param row Hovered row.
   * @param entry Its message.
   */
  show(row: HTMLElement, entry: EntryCollaborationChat): void {
    this.entry = entry;
    this.shownLabels = null;
    row.append(this.element);
    this.update();
    if (this.timer === null) this.timer = setInterval(() => this.update(), ACTIONS_COLLABORATION_CHAT_RECHECK_MS);
  }

  /** Hides the toolbar. */
  hide(): void {
    this.entry = null;
    this.element.remove();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Rebuilds the buttons when the actions that apply changed. */
  update(): void {
    const entry = this.entry;
    if (entry === null) return;
    const shown = this.actions.filter((action) => action.shown(entry));
    const labels = shown.map((action) => action.label).join('\n');
    if (labels === this.shownLabels) return;
    this.shownLabels = labels;
    this.element.replaceChildren(...shown.map((action) => actionsCollaborationChatButton(action, entry)));
    this.element.style.display = shown.length === 0 ? 'none' : 'flex';
  }
}

/**
 * Creates one toolbar button.
 *
 * @param action Action.
 * @param entry Message it acts on.
 * @returns Button.
 */
function actionsCollaborationChatButton(
  action: ActionsCollaborationChatAction,
  entry: EntryCollaborationChat,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-chat-action';
  button.title = action.label;
  button.setAttribute('aria-label', action.label);
  button.style.cssText =
    'display:flex;align-items:center;justify-content:center;width:26px;height:24px;padding:0;border:none;border-radius:4px;background:none;color:#b5bac1;cursor:pointer';
  button.append(actionsCollaborationChatIcon(action.icon));
  button.addEventListener('mouseenter', () => (button.style.background = 'rgba(255,255,255,0.08)'));
  button.addEventListener('mouseleave', () => (button.style.background = 'none'));
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => action.run(entry));
  return button;
}

/**
 * Creates a 16 by 16 icon.
 *
 * @param path SVG path data.
 * @returns Icon element.
 */
function actionsCollaborationChatIcon(path: string): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const shape = document.createElementNS(namespace, 'path');
  shape.setAttribute('fill', 'currentColor');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}
