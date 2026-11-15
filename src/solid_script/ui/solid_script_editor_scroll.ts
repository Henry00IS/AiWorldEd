import {
  VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS,
  virtualListScrollbarBind,
  virtualListScrollbarBindStylesEnsure,
  virtualListScrollbarGutterSync,
} from '@/ui/virtual_list/virtual_list_scrollbar_bind.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';

/** Pixels one arrow click scrolls a SolidScript panel. */
const SOLID_SCRIPT_SCROLL_STEP_PX = 22;

/**
 * Wraps a scrolling panel of the script editor in a host that shows the
 * Outliner-style scrollbar instead of the native one, like every other list of
 * the editor. The bar follows scrolling, resizing and new content.
 *
 * @param scroller Element that scrolls vertically.
 * @param flex Flex of the host where the panel used to sit, such as "1 1 0".
 * @param idlePaddingPx Right padding of the panel while nothing overflows.
 * @returns Host to place instead of the panel.
 */
export function solidScriptScrollerWrap(scroller: HTMLElement, flex: string, idlePaddingPx: number): HTMLElement {
  virtualListScrollbarBindStylesEnsure();
  const host = document.createElement('div');
  host.className = SOLID_SCRIPT_EDITOR_CLASSES.scrollHost;
  host.style.flex = flex;
  scroller.classList.add(VIRTUAL_LIST_SCROLLBAR_BIND_SCROLLER_CLASS);
  host.append(scroller);
  const binding = virtualListScrollbarBind(host, scroller, SOLID_SCRIPT_SCROLL_STEP_PX);
  const sync = (): void => virtualListScrollbarGutterSync(scroller, binding, idlePaddingPx);
  new MutationObserver(sync).observe(scroller, { childList: true, subtree: true, characterData: true });
  sync();
  return host;
}
