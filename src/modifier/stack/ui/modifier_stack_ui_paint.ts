import { getActiveUiThemePalette, resolveUiThemeId, type UiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/** Theme roles of modifier stack inspector elements. */
export type ModifierStackUiPaintRole = 'text' | 'button' | 'card' | 'divider' | 'eyeOn' | 'eyeOff' | 'error';

/** Data attribute that marks an element for repainting on theme changes. */
const MODIFIER_STACK_UI_PAINT_ATTRIBUTE = 'data-modifier-stack-paint';

/**
 * Returns the warning colour readable on the active theme.
 *
 * @returns CSS colour.
 */
function modifierStackUiErrorColor(): string {
  if (typeof document === 'undefined') return '#f0a35e';
  return resolveUiThemeId(document.documentElement) === 'light' ? '#a34a00' : '#f0a35e';
}

/**
 * Writes the colours of one role from a palette.
 *
 * @param element Element to paint.
 * @param role Theme role.
 * @param palette Active palette.
 */
function modifierStackUiPaintApply(
  element: HTMLElement,
  role: ModifierStackUiPaintRole,
  palette: UiThemePalette,
): void {
  if (role === 'divider') {
    element.style.borderTop = `1px solid ${palette.panelBorderColorInner}`;
    return;
  }
  if (role === 'button' || role === 'card') {
    element.style.border = `1px solid ${palette.panelBorderColorInner}`;
    element.style.background = palette.controlBackground;
  }
  if (role === 'eyeOff') element.style.color = palette.menuDisabledColor;
  else if (role === 'error') element.style.color = modifierStackUiErrorColor();
  else element.style.color = palette.panelTextColor;
}

/**
 * Paints an element for a theme role and remembers the role, so the inspector
 * follows later theme changes: white text on the dark theme, the light
 * palette's own text colour on the light theme.
 *
 * @param element Element to paint.
 * @param role Theme role.
 * @returns The element.
 */
export function modifierStackUiPaint<T extends HTMLElement>(element: T, role: ModifierStackUiPaintRole): T {
  element.setAttribute(MODIFIER_STACK_UI_PAINT_ATTRIBUTE, role);
  modifierStackUiPaintApply(element, role, getActiveUiThemePalette());
  return element;
}

/**
 * Repaints every marked element under a root for the active theme.
 *
 * @param root Inspector root.
 */
export function modifierStackUiRepaint(root: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  const marked = [root, ...root.querySelectorAll<HTMLElement>(`[${MODIFIER_STACK_UI_PAINT_ATTRIBUTE}]`)];
  for (const element of marked) {
    const role = element.getAttribute(MODIFIER_STACK_UI_PAINT_ATTRIBUTE) as ModifierStackUiPaintRole | null;
    if (role) modifierStackUiPaintApply(element, role, palette);
  }
}
