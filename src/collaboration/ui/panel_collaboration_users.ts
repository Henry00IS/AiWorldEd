import { Theme } from '@/theme.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';
import { applyFloatingPanelToolChrome } from '@/ui/floating_panel/panel_floating_tool_chrome.js';

/** Smallest users window width. */
const PANEL_COLLABORATION_USERS_MIN_WIDTH_PX = 220;

/**
 * Room users list and password window. Uses the shared floating window chrome
 * so pointer hits stay inside the panel instead of reaching the 3D viewport.
 */
export class PanelCollaborationUsers extends PanelFloating {
  private readonly body: HTMLElement;
  private readonly titleLabel: HTMLElement;
  private readonly outside: (event: MouseEvent) => void;
  private ignoreOutside: HTMLElement | null;

  /**
   * Builds the hidden users window.
   *
   * @param host Element that hosts floating editor windows.
   * @param bottomInset Returns height kept free below the window.
   */
  constructor(host: HTMLElement, bottomInset: () => number = () => 0) {
    super(host, { corner: 'bottom-right', closeOnEscape: true, bottomInsetPx: bottomInset });
    this.ignoreOutside = null;
    const title = this.createStandardTitleBar({ titleText: 'Users', flexShrinkZero: true });
    this.titleLabel = title.title;
    this.body = panelCollaborationUsersBody();
    this.chromeApply();
    this.root.append(title.bar, this.body);
    this.pointerContainBind();
    this.outside = (event) => this.outsideDismiss(event);
  }

  /**
   * Opens the window next to an anchor control.
   *
   * @param title Title bar text.
   * @param rows Member and password rows.
   * @param anchor Control used for placement and outside-click ignore.
   */
  openNear(title: string, rows: HTMLElement[], anchor: HTMLElement): void {
    this.ignoreOutside = anchor;
    this.contentSet(title, rows);
    this.show();
    this.placeAbove(anchor);
    document.addEventListener('mousedown', this.outside, true);
  }

  /**
   * Replaces the title and body rows.
   *
   * @param title Title bar text.
   * @param rows Member and password rows.
   */
  contentSet(title: string, rows: HTMLElement[]): void {
    this.titleLabel.textContent = title;
    this.body.replaceChildren(...rows);
    if (this.isOpen()) this.clampToScreenIfVisible();
  }

  /** Hides the window and drops the outside-click listener. */
  override hide(_force: boolean = false): void {
    this.outsideUnbind();
    super.hide(_force);
  }

  /** Clears outside listening when the window closes for any reason. */
  protected override onAfterHide(): void {
    this.outsideUnbind();
  }

  /** Applies shared tool-window chrome. */
  private chromeApply(): void {
    this.root.className = 'editor-collaboration-users';
    applyFloatingPanelToolChrome(this.root, {
      minWidth: `${PANEL_COLLABORATION_USERS_MIN_WIDTH_PX}px`,
      borderBox: true,
      overflowHidden: true,
      paddingBottom: '6px',
    });
  }

  /** Stops pointer traffic on the card from reaching the viewport beneath. */
  private pointerContainBind(): void {
    const stop = (event: Event) => event.stopPropagation();
    this.root.addEventListener('pointerdown', stop);
    this.root.addEventListener('mousedown', stop);
    this.root.addEventListener('mouseup', stop);
    this.root.addEventListener('click', stop);
    this.root.addEventListener('wheel', stop, { passive: true });
    this.root.addEventListener('contextmenu', stop);
  }

  /**
   * Places the window above an anchor control, right-aligned to it.
   *
   * @param anchor Placement anchor.
   */
  private placeAbove(anchor: HTMLElement): void {
    const chip = anchor.getBoundingClientRect();
    const panel = this.root.getBoundingClientRect();
    const width = panel.width > 0 ? panel.width : PANEL_COLLABORATION_USERS_MIN_WIDTH_PX;
    const height = panel.height > 0 ? panel.height : 120;
    const left = Math.min(Math.max(8, chip.right - width), Math.max(8, window.innerWidth - width - 8));
    const top = Math.max(8, chip.top - height - 6);
    this.setTopLeftPosition(left, top);
  }

  /**
   * Closes when a press lands outside the window and its toggle control.
   *
   * @param event Document mousedown.
   */
  private outsideDismiss(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.root.contains(target)) return;
    if (this.ignoreOutside?.contains(target)) return;
    this.hide(true);
  }

  /** Removes the document outside-click listener. */
  private outsideUnbind(): void {
    document.removeEventListener('mousedown', this.outside, true);
    this.ignoreOutside = null;
  }
}

/**
 * Creates the scrollable member list body.
 *
 * @returns Body element.
 */
function panelCollaborationUsersBody(): HTMLElement {
  const body = document.createElement('div');
  body.className = 'editor-collaboration-users-body';
  body.style.cssText =
    'display:flex;flex-direction:column;gap:2px;padding:6px 8px 0;max-height:320px;overflow:auto;font:12px/16px ' +
    Theme.uiFontFamily +
    ';color:' +
    Theme.buttonTextColor;
  return body;
}
