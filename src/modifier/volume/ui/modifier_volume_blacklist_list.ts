import { Theme } from '@/theme.js';
import type { ModifierVolumeTargetRow } from '@/modifier/volume/modifier_volume_target_tree.js';

/** Scrollable outliner of objects a volume can ignore. */
export class ModifierVolumeBlacklistList {
  private readonly element: HTMLDivElement;
  private toggleHandler: ((id: string, checked: boolean) => void) | null;

  /** Creates an empty affect list. */
  constructor() {
    this.element = document.createElement('div');
    this.toggleHandler = null;
    this.applyChrome();
  }

  /**
   * Returns the scroll box.
   *
   * @returns List element.
   */
  getElement(): HTMLDivElement {
    return this.element;
  }

  /**
   * Registers the handler for a checkbox change.
   *
   * @param handler Receives the object id and the new checked state.
   */
  bindToggle(handler: (id: string, checked: boolean) => void): void {
    this.toggleHandler = handler;
  }

  /**
   * Replaces the visible rows.
   *
   * @param rows Rows in outliner order.
   * @param emptyText Note shown when there are no rows.
   */
  setRows(rows: readonly ModifierVolumeTargetRow[], emptyText = 'Nothing is touching this volume'): void {
    this.element.replaceChildren();
    if (rows.length === 0) {
      this.element.appendChild(this.createEmptyNote(emptyText));
      return;
    }
    for (const row of rows) this.element.appendChild(this.createRow(row));
  }

  /** Paints the scroll box. */
  private applyChrome(): void {
    this.element.style.flex = '1';
    this.element.style.minWidth = '0';
    this.element.style.maxHeight = '160px';
    this.element.style.overflow = 'auto';
    this.element.style.background = '#141414';
    this.element.style.border = '1px solid #2a2a2a';
    this.element.style.borderRadius = '4px';
    this.element.style.padding = '4px 0';
  }

  /**
   * Builds one checkable row.
   *
   * @param row Row data.
   * @returns Row element.
   */
  private createRow(row: ModifierVolumeTargetRow): HTMLLabelElement {
    const line = document.createElement('label');
    this.paintRow(line, row.depth);
    const box = this.createCheckbox(row);
    line.appendChild(box);
    line.appendChild(this.createName(row.name));
    return line;
  }

  /**
   * Styles one row.
   *
   * @param line Row element.
   * @param depth Indent depth.
   */
  private paintRow(line: HTMLLabelElement, depth: number): void {
    line.style.display = 'flex';
    line.style.alignItems = 'center';
    line.style.gap = '6px';
    line.style.padding = '2px 8px';
    line.style.paddingLeft = `${8 + depth * 14}px`;
    line.style.color = Theme.buttonTextColor;
    line.style.fontFamily = 'monospace';
    line.style.fontSize = '12px';
  }

  /**
   * Builds the checkbox for one object.
   *
   * @param row Row data.
   * @returns Checkbox.
   */
  private createCheckbox(row: ModifierVolumeTargetRow): HTMLInputElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = row.checked;
    box.setAttribute('aria-label', row.name);
    box.addEventListener('change', () => this.toggleHandler?.(row.id, box.checked));
    return box;
  }

  /**
   * Builds the name label.
   *
   * @param name Object name.
   * @returns Name element.
   */
  private createName(name: string): HTMLSpanElement {
    const text = document.createElement('span');
    text.textContent = name;
    return text;
  }

  /**
   * Builds the note shown when the list has no rows.
   *
   * @param text Note text.
   * @returns Note element.
   */
  private createEmptyNote(text: string): HTMLDivElement {
    const note = document.createElement('div');
    note.textContent = text;
    note.style.color = Theme.outlinerNameIdColor;
    note.style.fontFamily = 'monospace';
    note.style.fontSize = '12px';
    note.style.padding = '4px 8px';
    return note;
  }
}
