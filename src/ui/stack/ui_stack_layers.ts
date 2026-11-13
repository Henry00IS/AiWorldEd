/**
 * Shared editor DOM stacking bands. Keep floating tool windows below menus so
 * dropdowns and context menus never draw under Tools / Texture / UV panels.
 *
 * Order (low → high): chrome → floating tools → menus → modals → confirms →
 * exclusive shield → surfaces that must stay above that shield.
 */
export const UiStackLayers = Object.freeze({
  /** Viewport title bars and in-pane chrome. */
  viewportChrome: 20,
  /** Main application toolbar strip. */
  mainToolbar: 100,
  /** First z-index assigned to floating tool windows. */
  floatingPanelBase: 5000,
  /**
   * Highest z-index floating panels may use. Menus always sit above this so
   * repeated bring-to-front clicks cannot cover dropdowns.
   */
  floatingPanelCeiling: 8999,
  /** Root dropdown / type menus (File, Edit, viewport title, …). */
  menu: 10000,
  /** Nested submenu flyouts slightly above their parent menu. */
  menuSubmenu: 10001,
  /** Right-click context menus. */
  contextMenu: 10050,
  /** About / settings style modal backdrops. */
  modal: 12000,
  /** Blocking confirm dialogs. */
  confirm: 20000,
  /**
   * Full-screen exclusive-tool pointer shield. Sits above ordinary chrome,
   * menus and dialogs so a busy tool keeps the pointer.
   */
  exclusiveShield: 2147483646,
  /**
   * Surfaces that must stay clickable above the exclusive shield, such as the
   * image lightbox.
   */
  aboveExclusiveShield: 2147483647,
});

/**
 * Returns the z-index for a menu panel root or nested flyout.
 *
 * @param isSubmenu Whether the panel is a nested cascade flyout.
 * @returns CSS z-index integer.
 */
export function getMenuPanelZIndex(isSubmenu: boolean): number {
  return isSubmenu ? UiStackLayers.menuSubmenu : UiStackLayers.menu;
}
