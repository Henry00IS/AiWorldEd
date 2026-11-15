import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { EditorApiHost } from './editor_api_host.js';
import { failResult, okResult } from './editor_api_result.js';
import { menuRegistry, type MenuRegistration } from '@/ui/menu/menu_registry.js';
import { isMenuAction, isMenuSubmenu, type ToolbarMenuAction, type ToolbarMenuEntry } from '@/ui/menu/menu_types.js';

/** One clickable menu entry as AI tools see it. */
interface MenuItemDescription {
  path: string[];
  enabled: boolean;
  shortcut?: string;
  tooltip?: string;
  /** Why the entry cannot run through MCP, when it cannot. */
  blocked?: string;
}

/** Visible action with its menu path. */
interface MenuItemFound {
  path: string[];
  action: ToolbarMenuAction;
  menu: MenuRegistration;
}

/**
 * Lists and runs the editor's menus: every entry a user can click, read live
 * from the same declarative entries the menus draw, so new entries appear
 * without MCP changes.
 */
export class EditorApiMenu {
  /**
   * Creates the menu part.
   *
   * @param host Injected editor systems.
   */
  constructor(private readonly host: EditorApiHost) {}

  /**
   * Lists visible menu entries.
   *
   * @param menu Optional menu name to list alone.
   * @returns Menus with their entries.
   */
  menuList(menu?: string): McpToolResult {
    const items = this.items().filter((item) => !menu || item.menu.path === menu);
    if (menu && items.length === 0) return failResult(`No menu ${menu}. Menus: ${this.menuNames().join(', ')}`);
    return okResult(`${items.length} menu item(s)`, { items: items.map((item) => this.describe(item)) });
  }

  /**
   * Runs one menu entry the way a click does.
   *
   * @param path Menu name, then submenu labels, then the entry label.
   * @returns Result.
   */
  menuRun(path: string[]): McpToolResult {
    const item = this.items().find((candidate) => candidate.path.join('\u0000') === path.join('\u0000'));
    if (!item)
      return failResult(
        `No visible menu item ${path.join(' > ')}; call editor_menu_list (Edit Mode menus only show in Edit Mode)`,
      );
    const description = this.describe(item);
    if (description.blocked) return failResult(description.blocked);
    if (!description.enabled) return failResult(`${path.join(' > ')} is disabled right now (check the selection)`);
    item.action.onClick();
    this.host.refreshAfterWorldMutation();
    return okResult(`Ran ${path.join(' > ')}`);
  }

  /**
   * Returns the registered menu names.
   *
   * @returns Names.
   */
  private menuNames(): string[] {
    return menuRegistry.list().map((menu) => menu.path);
  }

  /**
   * Collects every visible action of every menu.
   *
   * @returns Actions with paths.
   */
  private items(): MenuItemFound[] {
    return menuRegistry.list().flatMap((menu) => this.collect(menu, [menu.path], menu.entries()));
  }

  /**
   * Collects visible actions from entries, descending into submenus.
   *
   * @param menu Owning menu.
   * @param prefix Path so far.
   * @param entries Entries.
   * @returns Actions with paths.
   */
  private collect(menu: MenuRegistration, prefix: string[], entries: ToolbarMenuEntry[]): MenuItemFound[] {
    return entries.flatMap((entry): MenuItemFound[] => {
      if (isMenuSubmenu(entry)) {
        if (entry.isVisible && !entry.isVisible()) return [];
        return this.collect(menu, [...prefix, entry.label], entry.childrenLive?.() ?? entry.children);
      }
      if (!isMenuAction(entry) || (entry.isVisible && !entry.isVisible())) return [];
      return [{ path: [...prefix, entry.labelLive?.() ?? entry.label], action: entry, menu }];
    });
  }

  /**
   * Describes one entry.
   *
   * @param item Entry.
   * @returns Description.
   */
  private describe(item: MenuItemFound): MenuItemDescription {
    const label = item.path.at(-1) ?? '';
    const shortcut = typeof item.action.shortcut === 'function' ? item.action.shortcut() : item.action.shortcut;
    const tooltip = typeof item.action.tooltip === 'function' ? item.action.tooltip() : item.action.tooltip;
    const blocked = !item.menu.agentRunnable
      ? `The ${item.menu.path} menu loads scenes, opens files or changes sessions; only the user runs it`
      : /(\u2026|\.\.\.)$/.test(label)
        ? `${label} opens a dialog for the user; use a dedicated tool instead`
        : undefined;
    return {
      path: item.path,
      enabled: item.action.isEnabled ? item.action.isEnabled() : true,
      ...(shortcut ? { shortcut } : {}),
      ...(tooltip ? { tooltip } : {}),
      ...(blocked ? { blocked } : {}),
    };
  }
}
