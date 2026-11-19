import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommandFind,
  solidScriptCommandsOfCategory,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS, SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';
import { SolidScriptEditorFavorites } from './solid_script_editor_favorites.js';
import { MenuContext } from '@/ui/menu/menu_context.js';
import { DragEdgeAutoScroll } from '@/ui/drag/drag_edge_scroll.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { solidScriptDropOutline } from './solid_script_file_drop.js';

/** Drag data type carrying the id of a command dragged out of the palette. */
export const SOLID_SCRIPT_EDITOR_DRAG_COMMAND = 'application/x-aiworlded-solidscript-command';

/** One command entry of the palette and its search text. */
interface SolidScriptEditorPaletteEntry {
  command: SolidScriptCommand;
  element: HTMLElement;
  caption: HTMLElement;
  /** Name, description and category in lower case. */
  text: string;
}

/**
 * The list of commands beside the script: drag one into the script, or double
 * click it to insert it at the caret line. Favorites come first, in name order;
 * a right click on any command adds it to them or removes it. The search field
 * on top filters the commands by name, description and category as you type, in
 * their own groups only; the arrow keys move through the results, Enter inserts
 * the highlighted one and Escape clears the search.
 */
export class SolidScriptEditorPalette {
  /** Palette element. */
  readonly element: HTMLElement;
  /** Search field. */
  readonly search: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly entries: SolidScriptEditorPaletteEntry[] = [];
  /** Favorites group: its caption and the favorite commands. */
  private readonly favorites = document.createElement('div');
  private highlighted: SolidScriptEditorPaletteEntry | null = null;
  /** Command menu while open. */
  private menu: MenuContext | null = null;
  /** Command dragged out of the palette, while one is. */
  private dragged: string | null = null;
  /** How many elements of the Favorites group a drag has entered and not left. */
  private favoritesDepth = 0;
  /** Where a command drag out of the palette was last seen, while one runs. */
  private dragPointer: { clientX: number; clientY: number } | null = null;
  /** Follows a command drag anywhere on the page. */
  private readonly dragOverBound = (event: DragEvent): void => this.dragOver(event);
  /** Scrolls the list while a command drag lingers near its top or bottom. */
  private readonly edgeScroll = new DragEdgeAutoScroll({
    element: () => this.list,
    scrollBy: (deltaY) => {
      const before = this.list.scrollTop;
      this.list.scrollTop = before + deltaY;
      return this.list.scrollTop !== before;
    },
    pointerGet: () => this.dragPointer ?? { clientX: 0, clientY: 0 },
    scrollWanted: () => this.dragPointer !== null && this.listUnder(this.dragPointer),
  });

  /**
   * Builds the palette from the command catalog.
   *
   * @param onInsert Inserts a command at the caret line.
   * @param onSelect Shows the help of a focused command.
   * @param favoritesMemory Remembers the favorite commands.
   */
  constructor(
    private readonly onInsert: (command: string) => void,
    private readonly onSelect: (command: SolidScriptCommand) => void,
    private readonly favoritesMemory = new SolidScriptEditorFavorites(),
  ) {
    this.element = document.createElement('div');
    this.element.className = SOLID_SCRIPT_EDITOR_CLASSES.palette;
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.className = SOLID_SCRIPT_EDITOR_CLASSES.paletteSearch;
    this.search.placeholder = 'Search Commands';
    this.search.setAttribute('aria-label', 'Search Commands');
    this.search.title =
      'Type part of a name or what it does, such as "round" or "cut". Enter inserts the highlighted command.';
    this.search.addEventListener('input', () => this.filter());
    this.search.addEventListener('keydown', (event) => this.searchKey(event));
    this.list = document.createElement('div');
    this.list.className = SOLID_SCRIPT_EDITOR_CLASSES.paletteList;
    this.list.setAttribute('role', 'list');
    this.list.setAttribute('aria-label', 'Commands');
    this.empty = document.createElement('div');
    this.empty.className = SOLID_SCRIPT_EDITOR_CLASSES.paletteEmpty;
    this.empty.textContent = 'No command matches. Try another word, or press Escape.';
    this.empty.hidden = true;
    this.favorites.className = SOLID_SCRIPT_EDITOR_CLASSES.paletteFavorites;
    this.list.append(this.favorites);
    this.favoritesRender(this.favoritesMemory.read());
    this.list.addEventListener('contextmenu', (event) => this.menuOpen(event));
    this.list.addEventListener('dragend', () => this.dragEnd());
    this.favorites.addEventListener('dragenter', (event) => this.favoritesEnter(event));
    this.favorites.addEventListener('dragover', (event) => this.favoritesTakes(event));
    this.favorites.addEventListener('dragleave', (event) => this.favoritesLeave(event));
    this.favorites.addEventListener('drop', (event) => this.favoritesDrop(event));
    for (const category of SOLID_SCRIPT_COMMAND_CATEGORIES) {
      const commands = solidScriptCommandsOfCategory(category);
      if (commands.length === 0) continue;
      const caption = this.caption(category);
      this.list.append(caption);
      for (const command of commands) {
        const element = this.item(command);
        this.list.append(element);
        const text = `${command.label} ${command.description} ${command.category} ${command.id}`.toLowerCase();
        this.entries.push({ command, element, caption, text });
      }
    }
    this.list.append(this.empty);
    this.element.append(this.search, solidScriptScrollerWrap(this.list, '1 1 0', 0));
  }

  /**
   * Stops following a command drag and closes the command menu, once the editor
   * closes.
   */
  dispose(): void {
    this.dragEnd();
    this.menu?.dispose();
    this.menu = null;
  }

  /**
   * Returns the commands the search leaves visible.
   *
   * @returns Command ids in palette order.
   */
  visible(): string[] {
    return this.entries.filter((entry) => !entry.element.hidden).map((entry) => entry.command.id);
  }

  /**
   * Selects a command, scrolls to it and shows its help. The search is cleared
   * first only when it hides the command.
   *
   * @param id Command id.
   * @returns False when the palette has no such command.
   */
  reveal(id: string): boolean {
    const entry = this.entries.find((candidate) => candidate.command.id === id);
    if (!entry) return false;
    if (entry.element.hidden) {
      this.search.value = '';
      this.filter();
    }
    this.highlight(entry);
    return true;
  }

  /**
   * Shows the commands matching every word of the search and highlights the
   * first.
   */
  private filter(): void {
    const words = this.search.value.toLowerCase().split(/\s+/).filter(Boolean);
    this.favorites.hidden = words.length > 0 || this.favorites.childElementCount === 0;
    const captions = new Set<HTMLElement>();
    for (const entry of this.entries) {
      const shown = words.every((word) => entry.text.includes(word));
      entry.element.hidden = !shown;
      if (shown) captions.add(entry.caption);
    }
    for (const entry of this.entries) entry.caption.hidden = !captions.has(entry.caption);
    this.empty.hidden = captions.size > 0;
    this.highlight(words.length > 0 ? (this.entries.find((entry) => !entry.element.hidden) ?? null) : null);
  }

  /**
   * Returns the commands shown under Favorites.
   *
   * @returns Command ids in palette order; empty while the search hides them.
   */
  favoritesVisible(): string[] {
    if (this.favorites.hidden) return [];
    return [...this.favorites.querySelectorAll<HTMLElement>('[data-command]')].map(
      (item) => item.dataset['command'] ?? '',
    );
  }

  /**
   * Lists the favorite commands under their caption, in name order; the group
   * hides when there are none or while searching.
   *
   * @param ids Favorite command ids.
   */
  private favoritesRender(ids: readonly string[]): void {
    const commands = ids
      .map((id) => solidScriptCommandFind(id))
      .filter((command): command is SolidScriptCommand => command !== undefined)
      .sort((left, right) => left.label.localeCompare(right.label));
    this.favorites.replaceChildren(
      ...(commands.length > 0 ? [this.caption('Favorites')] : []),
      ...commands.map((command) => this.item(command)),
    );
    this.favorites.hidden = commands.length === 0 || this.search.value.trim() !== '';
  }

  /**
   * Opens the menu of a command: Add to Favorites, or Remove from Favorites.
   *
   * @param event Context menu event.
   */
  private menuOpen(event: MouseEvent): void {
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-command]');
    const id = item?.dataset['command'];
    if (!id) return;
    event.preventDefault();
    const favorite = this.favoritesMemory.read().includes(id);
    this.menu?.dispose();
    this.menu = new MenuContext(this.element, [
      {
        label: favorite ? 'Remove from Favorites' : 'Add to Favorites',
        callback: () => this.favoritesRender(this.favoritesMemory.toggle(id)),
      },
    ]);
    this.menu.show(event.clientX, event.clientY);
  }

  /**
   * Handles the keys of the search field.
   *
   * @param event Key event.
   */
  private searchKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const shown = this.entries.filter((entry) => !entry.element.hidden);
      if (shown.length === 0) return;
      const at = this.highlighted ? shown.indexOf(this.highlighted) : -1;
      const next = event.key === 'ArrowDown' ? Math.min(shown.length - 1, at + 1) : Math.max(0, at - 1);
      this.highlight(shown[next] ?? null);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.highlighted) this.onInsert(this.highlighted.command.id);
    } else if (event.key === 'Escape' && this.search.value !== '') {
      event.preventDefault();
      event.stopPropagation();
      this.search.value = '';
      this.filter();
    }
  }

  /**
   * Highlights one result and shows its help.
   *
   * @param entry Entry, or null for none.
   */
  private highlight(entry: SolidScriptEditorPaletteEntry | null): void {
    this.highlighted?.element.classList.remove(SOLID_SCRIPT_EDITOR_CLASSES.paletteHighlighted);
    this.highlighted = entry;
    if (!entry) return;
    entry.element.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.paletteHighlighted);
    entry.element.scrollIntoView?.({ block: 'nearest' });
    this.onSelect(entry.command);
  }

  /**
   * Builds a category caption.
   *
   * @param category Category name.
   * @returns Caption element.
   */
  private caption(category: string): HTMLElement {
    const caption = document.createElement('div');
    caption.className = SOLID_SCRIPT_EDITOR_CLASSES.paletteCaption;
    caption.textContent = category;
    return caption;
  }

  /**
   * Builds the entry of one command.
   *
   * @param command Command.
   * @returns Entry element.
   */
  private item(command: SolidScriptCommand): HTMLElement {
    const item = document.createElement('div');
    item.className = SOLID_SCRIPT_EDITOR_CLASSES.paletteItem;
    item.dataset['command'] = command.id;
    item.tabIndex = 0;
    item.draggable = true;
    item.setAttribute('role', 'listitem');
    item.title = `${command.description}.\n${command.manual}\nDouble-click to insert below the current line, or drag into the script.`;
    const label = document.createElement('span');
    label.textContent = command.label;
    item.append(solidScriptEditorIcon(command.category, SOLID_SCRIPT_EDITOR_CATEGORY_COLORS[command.category]), label);
    item.addEventListener('dblclick', () => this.onInsert(command.id));
    item.addEventListener('focus', () => this.onSelect(command));
    item.addEventListener('keydown', (event) => event.key === 'Enter' && this.onInsert(command.id));
    item.addEventListener('dragstart', (event) => this.dragStart(event, command));
    return item;
  }

  /**
   * Starts dragging a command.
   *
   * @param event Drag event.
   * @param command Command.
   */
  private dragStart(event: DragEvent, command: SolidScriptCommand): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(SOLID_SCRIPT_EDITOR_DRAG_COMMAND, command.id);
    event.dataTransfer.setData('text/plain', command.label);
    event.dataTransfer.effectAllowed = 'copyMove';
    this.dragged = command.id;
    this.dragPointer = { clientX: event.clientX, clientY: event.clientY };
    document.addEventListener('dragover', this.dragOverBound, true);
  }

  /**
   * Scrolls the list while the command drag lingers near its top or bottom.
   *
   * @param event Drag over anywhere on the page.
   */
  private dragOver(event: DragEvent): void {
    if (!this.dragPointer) return;
    this.dragPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!this.listUnder(this.dragPointer)) return this.edgeScroll.stop();
    this.edgeScroll.tick();
    this.edgeScroll.loopStart();
  }

  /**
   * Ends a command drag, however it ended: dropped, cancelled or released
   * elsewhere.
   */
  private dragEnd(): void {
    this.dragged = null;
    this.favoritesOutline(false);
    this.dragPointer = null;
    this.edgeScroll.stop();
    document.removeEventListener('dragover', this.dragOverBound, true);
  }

  /**
   * Takes a command dragged onto the Favorites group when it is not a favorite
   * yet. The group only takes drops while it shows: while searching or with no
   * favorites it is hidden, and the command menu adds favorites instead.
   *
   * @param event Drag event over the group.
   * @returns True when the drag is taken.
   */
  private favoritesTakes(event: DragEvent): boolean {
    const id = this.dragged;
    if (!id || this.favorites.hidden || this.favoritesMemory.read().includes(id)) return false;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    return true;
  }

  /**
   * Outlines the Favorites group when a drag it takes enters it.
   *
   * @param event Drag enter event.
   */
  private favoritesEnter(event: DragEvent): void {
    if (!this.favoritesTakes(event)) return;
    this.favoritesDepth++;
    this.favoritesOutline(true);
  }

  /**
   * Hides the outline once the drag has left the group, not just a row in it.
   *
   * @param event Drag leave event.
   */
  private favoritesLeave(event: DragEvent): void {
    this.favoritesDepth = Math.max(0, this.favoritesDepth - 1);
    const into = event.relatedTarget;
    if (into instanceof Node && this.favorites.contains(into)) return;
    if (this.favoritesDepth === 0 || into instanceof Node) this.favoritesOutline(false);
  }

  /**
   * Adds a command dropped onto the Favorites group.
   *
   * @param event Drop event.
   */
  private favoritesDrop(event: DragEvent): void {
    const id = this.dragged;
    const taken = this.favoritesTakes(event);
    this.favoritesOutline(false);
    if (!taken || !id) return;
    event.stopPropagation();
    this.favoritesRender(this.favoritesMemory.toggle(id));
  }

  /**
   * Shows or hides the drop outline of the Favorites group.
   *
   * @param on True shows it.
   */
  private favoritesOutline(on: boolean): void {
    if (!on) this.favoritesDepth = 0;
    solidScriptDropOutline(this.favorites, on, ThemeCss.accentColor);
  }

  /**
   * Returns whether a pointer is over the list.
   *
   * @param pointer Pointer in viewport coordinates.
   * @returns True inside the list's box.
   */
  private listUnder(pointer: { clientX: number; clientY: number }): boolean {
    const box = this.list.getBoundingClientRect();
    return (
      pointer.clientX >= box.left &&
      pointer.clientX <= box.right &&
      pointer.clientY >= box.top &&
      pointer.clientY <= box.bottom
    );
  }
}
