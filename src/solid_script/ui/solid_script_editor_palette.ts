import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommandsOfCategory,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS, SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';

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
 * click it to insert it at the caret line. The search field on top filters the
 * commands by name, description and category as you type; the arrow keys move
 * through the results, Enter inserts the highlighted one and Escape clears the
 * search.
 */
export class SolidScriptEditorPalette {
  /** Palette element. */
  readonly element: HTMLElement;
  /** Search field. */
  readonly search: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly entries: SolidScriptEditorPaletteEntry[] = [];
  private highlighted: SolidScriptEditorPaletteEntry | null = null;

  /**
   * Builds the palette from the command catalog.
   *
   * @param onInsert Inserts a command at the caret line.
   * @param onSelect Shows the help of a focused command.
   */
  constructor(
    private readonly onInsert: (command: string) => void,
    private readonly onSelect: (command: SolidScriptCommand) => void,
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
  }
}
