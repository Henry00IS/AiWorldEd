import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import { modifierStackUiPaint } from '@/modifier/stack/ui/modifier_stack_ui_paint.js';
import { modifierStackUiText } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';
import { onUiThemeChromeRefresh } from '@/ui/theme/theme_ui_refresh.js';
import { isObjectLocked } from '@/utils/object_lock.js';
import { CommandLevelNoteSet } from '../command_level_note_set.js';
import { LEVEL_NOTE_TEXT_MAX, LevelNote } from '../level_note.js';

/**
 * Inspector for one selected level note: its text in a multi-line field. An
 * edit commits as one undo step when the field loses focus.
 */
export class PanelPropertiesLevelNoteSection {
  private readonly section: HTMLElement;
  private readonly field: HTMLTextAreaElement;
  private readonly hint: HTMLElement;
  private note: THREE.Object3D | null = null;
  private commandStack: CommandStack | null = null;

  /**
   * Creates the section.
   *
   * @param createSectionContainer Section chrome factory.
   * @param createSectionHeader Header factory.
   */
  constructor(createSectionContainer: () => HTMLElement, createSectionHeader: (title: string) => HTMLElement) {
    this.section = createSectionContainer();
    this.section.style.display = 'none';
    this.section.appendChild(createSectionHeader('Note'));
    this.field = this.createField();
    this.hint = modifierStackUiText(
      'div',
      'Notes are for your team only: they show in the editor and never in game exports.',
      true,
    );
    this.hint.style.lineHeight = '1.4';
    const content = document.createElement('div');
    Object.assign(content.style, { padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '6px' });
    content.append(this.field, this.hint);
    this.section.appendChild(content);
    onUiThemeChromeRefresh(() => this.paintField());
  }

  /**
   * Returns the section element.
   *
   * @returns Section root.
   */
  getElement(): HTMLElement {
    return this.section;
  }

  /**
   * Sets the undo stack used for every edit.
   *
   * @param stack Command stack, or null.
   */
  setCommandStack(stack: CommandStack | null): void {
    this.commandStack = stack;
  }

  /**
   * Shows the section for exactly one selected note and reads its text.
   *
   * @param objects Current selection.
   */
  updateFromObjects(objects: THREE.Object3D[]): void {
    const note = objects.length === 1 && LevelNote.is(objects[0]!) ? objects[0]! : null;
    if (note !== this.note) this.commit();
    this.note = note;
    this.section.style.display = note === null ? 'none' : '';
    if (note === null) return;
    this.field.disabled = isObjectLocked(note);
    if (document.activeElement !== this.field) this.field.value = LevelNote.read(note).text;
  }

  /**
   * Builds the text field.
   *
   * @returns Text area.
   */
  private createField(): HTMLTextAreaElement {
    const field = document.createElement('textarea');
    field.rows = 5;
    field.maxLength = LEVEL_NOTE_TEXT_MAX;
    field.placeholder = 'Write a note for your team…';
    field.setAttribute('aria-label', 'Note Text');
    Object.assign(field.style, {
      width: '100%',
      boxSizing: 'border-box',
      resize: 'vertical',
      minHeight: '72px',
      padding: '6px 8px',
      borderRadius: '4px',
      font: '12px monospace',
      lineHeight: '1.4',
    });
    modifierStackUiPaint(field, 'text');
    this.paintFieldOn(field);
    field.addEventListener('change', () => this.commit());
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') field.blur();
    });
    return field;
  }

  /** Repaints the field for the active theme. */
  private paintField(): void {
    this.paintFieldOn(this.field);
  }

  /**
   * Writes the input colors of the active theme.
   *
   * @param field Text area.
   */
  private paintFieldOn(field: HTMLTextAreaElement): void {
    const palette = getActiveUiThemePalette();
    field.style.background = palette.inputBackground;
    field.style.color = palette.inputTextColor;
    field.style.border = `1px solid ${palette.inputBorderColor}`;
  }

  /** Pushes the typed text as one undoable edit when it changed. */
  private commit(): void {
    const note = this.note;
    if (note === null || isObjectLocked(note)) return;
    const before = LevelNote.read(note);
    const after = LevelNote.normalize({ text: this.field.value });
    if (after.text === before.text) return;
    const command = new CommandLevelNoteSet(note, before, after);
    if (this.commandStack) this.commandStack.push(command);
    else command.execute();
  }
}
