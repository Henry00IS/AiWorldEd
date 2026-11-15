import type { SolidScriptCommand } from '@/solid_script/commands/solid_script_command.js';
import {
  SOLID_SCRIPT_COMMAND_CATEGORIES,
  solidScriptCommands,
} from '@/solid_script/commands/solid_script_command_catalog.js';
import { SOLID_SCRIPT_EDITOR_CATEGORY_COLORS, SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';

/** Drag data type carrying the id of a command dragged out of the palette. */
export const SOLID_SCRIPT_EDITOR_DRAG_COMMAND = 'application/x-aiworlded-solidscript-command';

/**
 * The list of commands beside the script: drag one into the script, or double
 * click it to insert it at the caret line.
 */
export class SolidScriptEditorPalette {
  /** Palette element. */
  readonly element: HTMLElement;

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
    this.element.setAttribute('role', 'list');
    this.element.setAttribute('aria-label', 'Commands');
    for (const category of SOLID_SCRIPT_COMMAND_CATEGORIES) {
      const commands = solidScriptCommands.filter((command) => command.inPalette && command.category === category);
      if (commands.length === 0) continue;
      this.element.append(this.caption(category), ...commands.map((command) => this.item(command)));
    }
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
    item.title = `${command.description}\nDouble-click to insert at the caret, or drag into the script.`;
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
