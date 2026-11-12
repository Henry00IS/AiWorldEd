import { Theme } from '@/theme.js';
import { getMenuPanelZIndex } from '@/ui/stack/ui_stack_layers.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/**
 * Applies layout styles to a dropdown or submenu panel. Root menus are
 * re-parented to document.body on open (fixed) so they escape the toolbar
 * stacking context and paint above floating tool windows.
 *
 * @param menu Menu panel element.
 * @param isSubmenu Whether the panel is a nested flyout (not the root drop).
 */
export function styleMenuPanel(menu: HTMLElement, isSubmenu: boolean): void {
  const palette = getActiveUiThemePalette();
  menu.style.display = 'none';
  menu.style.position = isSubmenu ? 'absolute' : 'fixed';
  menu.style.zIndex = String(getMenuPanelZIndex(isSubmenu));
  menu.style.minWidth = '196px';
  menu.style.background = palette.menuBackground;
  menu.style.border = `1px solid ${palette.menuBorderColor}`;
  menu.style.borderRadius = '8px';
  menu.style.boxShadow = palette.menuBoxShadow;
  menu.style.padding = '4px';
  if (isSubmenu) {
    // Slight overlap so the pointer never crosses a dead gap when entering the
    // flyout from the parent row (Windows-style cascade menus).
    menu.style.top = '0';
    menu.style.left = 'calc(100% - 4px)';
    menu.style.marginLeft = '0';
  } else {
    menu.style.top = '0';
    menu.style.left = '0';
  }
}

/**
 * Styles a clickable menu row as a full-width flex list item.
 *
 * @param entry Menu item button.
 */
export function styleMenuActionRow(entry: HTMLButtonElement): void {
  const palette = getActiveUiThemePalette();
  entry.style.display = 'flex';
  entry.style.alignItems = 'center';
  entry.style.justifyContent = 'space-between';
  entry.style.gap = '16px';
  entry.style.width = '100%';
  entry.style.textAlign = 'left';
  entry.style.padding = '7px 10px';
  entry.style.margin = '0';
  entry.style.border = '1px solid transparent';
  entry.style.borderRadius = '5px';
  entry.style.background = 'transparent';
  entry.style.color = palette.menuTextColor;
  entry.style.cursor = 'pointer';
  entry.style.fontFamily = Theme.uiFontFamily;
  entry.style.fontSize = '12px';
  entry.style.fontWeight = '500';
  entry.style.position = 'relative';
  entry.style.overflow = 'visible';
  entry.style.boxSizing = 'border-box';
}

/**
 * Styles the primary label span inside a menu row.
 *
 * @param label Label element.
 */
export function styleMenuLabel(label: HTMLElement): void {
  label.style.flex = '1 1 auto';
  label.style.minWidth = '0';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  label.style.whiteSpace = 'nowrap';
}

/**
 * Styles the right-aligned keyboard shortcut hint.
 *
 * @param shortcut Shortcut label element.
 */
export function styleMenuShortcut(shortcut: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  shortcut.classList.add('editor-toolbar-dropdown-shortcut');
  shortcut.style.flex = '0 0 auto';
  shortcut.style.marginLeft = '12px';
  shortcut.style.opacity = '0.55';
  shortcut.style.fontSize = '11px';
  shortcut.style.fontWeight = '400';
  shortcut.style.letterSpacing = '0.02em';
  shortcut.style.whiteSpace = 'nowrap';
  shortcut.style.color = palette.menuMutedColor;
}

/**
 * Styles the submenu disclosure caret on the right of a parent row.
 *
 * @param caret Caret element.
 */
export function styleMenuSubmenuCaret(caret: HTMLElement): void {
  caret.classList.add('editor-toolbar-dropdown-submenu-caret');
  caret.style.flex = '0 0 auto';
  caret.style.marginLeft = '8px';
  caret.style.opacity = '0.7';
  caret.style.fontSize = '10px';
  caret.style.lineHeight = '1';
}

/**
 * Styles a horizontal separator line between menu sections.
 *
 * @param separator Separator element.
 */
export function styleMenuSeparator(separator: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  separator.classList.add('editor-toolbar-dropdown-separator');
  separator.setAttribute('role', 'separator');
  separator.style.height = '1px';
  separator.style.margin = '4px 6px';
  separator.style.background = palette.menuSeparatorColor;
  separator.style.border = 'none';
  separator.style.padding = '0';
  separator.style.flexShrink = '0';
}

/**
 * Styles a non-interactive section heading in a menu.
 *
 * @param heading Heading element.
 */
export function styleMenuHeading(heading: HTMLElement): void {
  const palette = getActiveUiThemePalette();
  heading.classList.add('editor-toolbar-dropdown-heading');
  heading.setAttribute('role', 'presentation');
  heading.style.padding = '6px 10px 2px';
  heading.style.fontFamily = Theme.uiFontFamily;
  heading.style.fontSize = '10px';
  heading.style.fontWeight = '600';
  heading.style.letterSpacing = '0.08em';
  heading.style.textTransform = 'uppercase';
  heading.style.color = palette.menuMutedColor;
  heading.style.userSelect = 'none';
}

/**
 * Applies enabled or disabled visuals to one menu action row.
 *
 * @param entry Menu item button.
 * @param enabled Whether the item can be activated.
 */
export function applyMenuItemEnabledState(entry: HTMLButtonElement, enabled: boolean): void {
  const palette = getActiveUiThemePalette();
  entry.disabled = !enabled;
  entry.style.opacity = enabled ? '1' : '0.4';
  entry.style.cursor = enabled ? 'pointer' : 'default';
  entry.style.color = enabled ? palette.menuTextColor : palette.menuDisabledColor;
}

/**
 * Applies hover highlight for an enabled menu row.
 *
 * @param entry Menu item button.
 * @param hovered Whether the pointer is over the row.
 */
export function applyMenuItemHoverState(entry: HTMLButtonElement, hovered: boolean): void {
  const palette = getActiveUiThemePalette();
  if (entry.disabled) {
    entry.style.background = 'transparent';
    return;
  }
  entry.style.background = hovered ? palette.menuHoverBackground : 'transparent';
}
