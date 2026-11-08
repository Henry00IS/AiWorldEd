import { Theme } from '@/theme.js';
import { getActiveUiThemePalette } from '@/ui/theme/theme_ui_palette.js';

/** One entry in a select field. */
export interface InputSelectChoice {
  /** Stored value. */
  value: string;
  /** Visible label. */
  label: string;
  /** Hover text. Empty when the entry has no extra explanation. */
  title?: string;
  /** Optional native option group. */
  group?: string;
}

/** Themed select used by inspector rows. A blank entry represents a mixed value. */
export class InputSelect {
  private readonly element: HTMLSelectElement;
  private readonly blankOption: HTMLOptionElement;
  private commitHandler: (() => void) | null;

  /**
   * Creates a select and fills it.
   *
   * @param choices Selectable entries.
   * @param ariaLabel Accessible name.
   */
  constructor(choices: readonly InputSelectChoice[], ariaLabel: string) {
    this.element = document.createElement('select');
    this.blankOption = this.createOption('', '');
    this.blankOption.hidden = true;
    this.commitHandler = null;
    this.applyChrome();
    this.setChoices(choices);
    this.element.setAttribute('aria-label', ariaLabel);
    this.element.addEventListener('change', () => {
      this.refreshTitle();
      this.commitHandler?.();
    });
  }

  /**
   * Returns the select element.
   *
   * @returns Select DOM node.
   */
  getElement(): HTMLSelectElement {
    return this.element;
  }

  /**
   * Replaces the selectable entries.
   *
   * @param choices Selectable entries.
   */
  setChoices(choices: readonly InputSelectChoice[]): void {
    this.element.replaceChildren();
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const choice of choices) this.appendChoice(choice, groups);
    this.refreshTitle();
  }

  /**
   * Appends an option to its native group, creating that group when needed.
   *
   * @param choice Option metadata.
   * @param groups Groups already inserted in this select.
   */
  private appendChoice(choice: InputSelectChoice, groups: Map<string, HTMLOptGroupElement>): void {
    let parent: HTMLElement = this.element;
    if (choice.group) {
      let group = groups.get(choice.group);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = choice.group;
        groups.set(choice.group, group);
        this.element.append(group);
      }
      parent = group;
    }
    parent.appendChild(this.createOption(choice.value, choice.label, choice.title ?? ''));
  }

  /**
   * Selects the shared value. A hidden blank is used only when the values
   * differ.
   *
   * @param values Per-object values.
   */
  setSharedValues(values: readonly string[]): void {
    const first = values[0];
    const mixed = first === undefined || values.some((value) => value !== first);
    this.showBlankOption(mixed);
    this.element.value = mixed || first === undefined ? '' : first;
    this.refreshTitle();
  }

  /**
   * Inserts the blank entry only while the selection is mixed.
   *
   * @param mixed True when the bound objects disagree.
   */
  private showBlankOption(mixed: boolean): void {
    if (!mixed) {
      this.blankOption.remove();
      return;
    }
    if (!this.blankOption.parentElement) this.element.insertBefore(this.blankOption, this.element.firstChild);
  }

  /**
   * Returns the selected value. Blank means mixed or unset.
   *
   * @returns Current value.
   */
  getValue(): string {
    return this.element.value;
  }

  /**
   * Binds the handler called when the user changes the selection.
   *
   * @param onCommit Commit handler.
   */
  bindCommit(onCommit: () => void): void {
    this.commitHandler = onCommit;
  }

  /**
   * Creates one option element.
   *
   * @param value Stored value.
   * @param label Visible label.
   * @param title Hover text. Empty when the entry has no extra explanation.
   * @returns Option element.
   */
  private createOption(value: string, label: string, title = ''): HTMLOptionElement {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    if (title !== '') option.title = title;
    return option;
  }

  /** Copies the selected entry's explanation onto the closed control. */
  private refreshTitle(): void {
    const selected = this.element.selectedOptions[0];
    this.element.title = selected?.title || selected?.textContent || '';
  }

  /** Applies the same input tokens used by the settings select. */
  private applyChrome(): void {
    const palette = getActiveUiThemePalette();
    this.element.style.width = '100%';
    this.element.style.boxSizing = 'border-box';
    this.element.style.padding = '4px 6px';
    this.element.style.borderRadius = '2px';
    this.element.style.border = `1px solid ${palette.inputBorderColor}`;
    this.element.style.background = palette.inputBackground;
    this.element.style.color = palette.inputTextColor;
    this.element.style.fontFamily = Theme.uiFontFamily;
    this.element.style.fontSize = '12px';
    this.element.style.outline = 'none';
    this.element.style.cursor = 'pointer';
    this.element.style.flex = '1';
    this.element.style.minWidth = '0';
  }
}
