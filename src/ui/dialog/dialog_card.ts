import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';

/**
 * Styles a modal dialog card: the dark gradient panel of the Export and Import
 * OBJ dialogs.
 *
 * @param root Dialog root.
 * @param width CSS width.
 * @param titleId Id of the dialog's title element.
 */
export function dialogCardStyle(root: HTMLElement, width: string, titleId: string): void {
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', titleId);
  Object.assign(root.style, {
    width,
    padding: '18px 20px 16px',
    borderRadius: '10px',
    background: `linear-gradient(180deg, ${hexToRgb(Theme.toolbarBackground)} 0%, ${hexToRgb(Theme.toolbarBackgroundEnd)} 100%)`,
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 18px 48px rgba(0,0,0,0.65)',
    color: Theme.buttonTextColor,
    boxSizing: 'border-box',
    fontFamily: Theme.uiFontFamily,
  });
  // Clicks inside the card must not reach the viewport behind the backdrop.
  root.addEventListener('mousedown', (event) => event.stopPropagation());
}

/**
 * Builds a dialog card title.
 *
 * @param id Element id.
 * @param text Title text.
 * @returns Heading.
 */
export function dialogCardTitle(id: string, text: string): HTMLElement {
  const title = document.createElement('h2');
  title.id = id;
  title.textContent = text;
  Object.assign(title.style, { margin: '0 0 14px', fontSize: '15px', fontWeight: '600', color: '#f0f0f0' });
  return title;
}

/**
 * Builds a dialog card button.
 *
 * @param label Text.
 * @param primary Whether it is the main action (orange).
 * @param onClick Click handler.
 * @returns Button.
 */
export function dialogCardButton(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.assign(button.style, {
    minWidth: '72px',
    padding: primary ? '7px 16px' : '6px 12px',
    borderRadius: '6px',
    border: primary ? `1px solid ${hexToRgb(Theme.selectionColor)}` : '1px solid rgba(255,255,255,0.12)',
    background: primary ? 'rgba(232, 106, 23, 0.28)' : 'rgba(255,255,255,0.06)',
    color: '#f2f2f2',
    cursor: 'pointer',
    fontFamily: Theme.uiFontFamily,
    fontSize: '12px',
    fontWeight: primary ? '600' : '500',
  });
  button.addEventListener('click', onClick);
  return button;
}
