/**
 * Declarative menu entries for toolbar dropdowns and nested flyout menus.
 * Action items may omit `kind` for a compact authoring style.
 */

/** Clickable menu row with optional enablement and shortcut label. */
export interface ToolbarMenuAction {
  /** Discriminator; omit or set to action for a normal item. */
  kind?: 'action';
  /** Visible left-side label. */
  label: string;
  /**
   * Optional live label, re-evaluated whenever the menu opens or refreshes;
   * replaces `label` for items that toggle, such as Connect and Disconnect.
   */
  labelLive?: () => string;
  /** Invoked when the enabled item is activated. */
  onClick: () => void;
  /**
   * Optional live enablement check evaluated when the menu opens or refreshes.
   * When omitted or true, the item is clickable.
   */
  isEnabled?: () => boolean;
  /**
   * Optional keyboard shortcut shown on the right. A function is re-evaluated
   * whenever the menu refreshes so rebound settings stay accurate.
   */
  shortcut?: string | (() => string | undefined | null);
  /**
   * Optional hover tooltip (native title). A function is re-evaluated whenever
   * the menu refreshes so dynamic help text stays accurate.
   */
  tooltip?: string | (() => string | undefined | null);
}

/** Horizontal rule between menu sections. */
export interface ToolbarMenuSeparator {
  kind: 'separator';
}

/** Non-interactive caption that names the menu section below it. */
export interface ToolbarMenuHeading {
  kind: 'heading';
  /** Caption text. */
  label: string;
}

/** Parent row that opens a nested flyout of child entries. */
export interface ToolbarMenuSubmenu {
  kind: 'submenu';
  /** Visible left-side label for the parent row. */
  label: string;
  /** Nested entries shown in the flyout. */
  children: ToolbarMenuEntry[];
  /**
   * Optional live enablement check for the parent row. When false, the submenu
   * cannot open.
   */
  isEnabled?: () => boolean;
  /**
   * Optional hover tooltip (native title). A function is re-evaluated whenever
   * the menu refreshes.
   */
  tooltip?: string | (() => string | undefined | null);
}

/** One entry in a toolbar dropdown or nested submenu panel. */
export type ToolbarMenuEntry = ToolbarMenuAction | ToolbarMenuSeparator | ToolbarMenuHeading | ToolbarMenuSubmenu;

/**
 * Alias retained for existing call sites that still import
 * {@link ToolbarDropdownItem}.
 */
export type ToolbarDropdownItem = ToolbarMenuEntry;

/**
 * Returns whether the entry is a visual separator.
 *
 * @param entry Menu entry candidate.
 * @returns True when the entry is a separator.
 */
export function isMenuSeparator(entry: ToolbarMenuEntry): entry is ToolbarMenuSeparator {
  return entry.kind === 'separator';
}

/**
 * Returns whether the entry opens a nested submenu.
 *
 * @param entry Menu entry candidate.
 * @returns True when the entry is a submenu parent.
 */
export function isMenuSubmenu(entry: ToolbarMenuEntry): entry is ToolbarMenuSubmenu {
  return entry.kind === 'submenu';
}

/**
 * Returns whether the entry is a clickable action row.
 *
 * @param entry Menu entry candidate.
 * @returns True when the entry is an action.
 */
export function isMenuAction(entry: ToolbarMenuEntry): entry is ToolbarMenuAction {
  return !isMenuSeparator(entry) && !isMenuSubmenu(entry) && !isMenuHeading(entry);
}

/**
 * Narrows a menu entry to a section heading.
 *
 * @param entry Menu entry candidate.
 * @returns True when the entry is a heading.
 */
export function isMenuHeading(entry: ToolbarMenuEntry): entry is ToolbarMenuHeading {
  return entry.kind === 'heading';
}
