import { Theme } from '@/theme.js';

/**
 * Styles the bottom status line of a floating tool window, the strip the
 * southeast resize grip sits on.
 *
 * @param element Status element.
 */
export function styleFloatingPanelStatusBar(element: HTMLElement): void {
  Object.assign(element.style, {
    padding: '6px 18px 8px 10px',
    color: Theme.statusBarTextColor,
    fontFamily: 'monospace',
    fontSize: '10px',
    flexShrink: '0',
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });
}
