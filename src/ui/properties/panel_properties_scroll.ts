import {
  VIRTUAL_LIST_SCROLLBAR_BIND_GUTTER_PX,
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindStylesEnsure,
  type VirtualListScrollbarBinding,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/** Arrow step of the inspector scrollbar in CSS pixels. */
const PANEL_PROPERTIES_SCROLL_STEP_PX = 24;

/**
 * Scrolling body of the properties panel with the same custom scrollbar the
 * outliner and chat use. Sections go into the content element; the scroller
 * reserves a gutter for the bar only while it overflows, so the bar never
 * covers a control, and it keeps its scroll offset when sections repaint.
 */
export class PanelPropertiesScroll {
  private readonly scroller: HTMLElement;
  private readonly content: HTMLElement;
  private readonly binding: VirtualListScrollbarBinding;
  private readonly observer: ResizeObserver | null;
  private offset = 0;

  /**
   * Creates the scroller inside a panel container.
   *
   * @param container Panel container; becomes the scrollbar's positioned host.
   */
  constructor(container: HTMLElement) {
    virtualListScrollbarBindStylesEnsure();
    container.style.position = 'relative';
    this.scroller = document.createElement('div');
    this.scroller.className = VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS;
    Object.assign(this.scroller.style, { flex: '1 1 auto', minHeight: '0', overflowX: 'hidden', overflowY: 'auto' });
    this.content = document.createElement('div');
    this.scroller.appendChild(this.content);
    container.appendChild(this.scroller);
    this.binding = virtualListScrollbarBind(container, this.scroller, PANEL_PROPERTIES_SCROLL_STEP_PX, [this.content]);
    this.scroller.addEventListener('scroll', () => this.remember());
    this.observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.layout());
    this.observer?.observe(this.content);
    this.observer?.observe(this.scroller);
  }

  /**
   * Returns the element sections are appended to.
   *
   * @returns Content element.
   */
  getContent(): HTMLElement {
    return this.content;
  }

  /**
   * Returns the native scroller.
   *
   * @returns Scroller element.
   */
  getScroller(): HTMLElement {
    return this.scroller;
  }

  /**
   * Reserves the bar gutter while content overflows, restores the remembered
   * offset when a repaint shrank and regrew the content, and syncs the bar.
   */
  layout(): void {
    const overflow = this.scroller.scrollHeight > this.scroller.clientHeight + 1;
    this.scroller.style.paddingRight = overflow ? `${VIRTUAL_LIST_SCROLLBAR_BIND_GUTTER_PX}px` : '0';
    const range = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    const wanted = Math.min(this.offset, range);
    if (Math.abs(this.scroller.scrollTop - wanted) > 1) this.scroller.scrollTop = wanted;
    this.binding.sync();
  }

  /** Removes the scrollbar and observers. */
  dispose(): void {
    this.observer?.disconnect();
    this.binding.dispose();
  }

  /**
   * Remembers the offset the user scrolled to. Offsets the browser clamps while
   * content is briefly shorter during a repaint are not remembered.
   */
  private remember(): void {
    const range = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight);
    if (this.scroller.scrollTop < range - 1 || this.offset <= range) this.offset = this.scroller.scrollTop;
  }
}

/**
 * Applies the panel container styles for the active theme.
 *
 * @param container Panel container.
 */
export function panelPropertiesContainerStyle(container: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  container.classList.add('editor-properties-panel');
  Object.assign(container.style, { display: 'flex', flexDirection: 'column', overflow: 'hidden' });
  Object.assign(container.style, { width: '200px', minWidth: '200px', userSelect: 'none' });
  container.style.background = palette.propertiesPanelBackground;
  container.style.borderLeft = `2px solid ${palette.panelBorderColor}`;
}
