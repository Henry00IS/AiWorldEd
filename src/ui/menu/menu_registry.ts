import type { ToolbarMenuEntry } from './menu_types.js';

/** One menu the editor shows, as the AI tools see it. */
export interface MenuRegistration {
  /** Menu name such as Edit or Face. */
  path: string;
  /** Builds the menu's current entries. */
  entries: () => ToolbarMenuEntry[];
  /**
   * False for menus that load scenes, open files or change sessions; they are
   * listed but never run by AI tools, so a shared session never reloads.
   */
  agentRunnable: boolean;
}

/**
 * Every menu the editor shows, so AI tools list and run the same entries a user
 * clicks.
 */
export class MenuRegistry {
  private readonly menus = new Map<string, MenuRegistration>();

  /**
   * Registers a menu; a later menu with the same path replaces it.
   *
   * @param path Menu name.
   * @param entries Builds the menu's entries.
   * @param agentRunnable False keeps AI tools from running its entries.
   * @returns Removes this registration.
   */
  add(path: string, entries: () => ToolbarMenuEntry[], agentRunnable = true): () => void {
    const registration: MenuRegistration = { path, entries, agentRunnable };
    this.menus.set(path, registration);
    return () => {
      if (this.menus.get(path) === registration) this.menus.delete(path);
    };
  }

  /**
   * Returns the registered menus in registration order.
   *
   * @returns Menus.
   */
  list(): MenuRegistration[] {
    return [...this.menus.values()];
  }
}

/** The editor's menus. */
export const menuRegistry = new MenuRegistry();
