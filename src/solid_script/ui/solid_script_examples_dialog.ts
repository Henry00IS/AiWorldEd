import {
  SOLID_SCRIPT_EXAMPLE_GROUPS,
  solidScriptExamplesFind,
  type SolidScriptExample,
} from '@/solid_script/examples/solid_script_examples.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import { SolidScriptDialog } from './solid_script_dialog.js';

/**
 * Asks which example to open as a new script.
 *
 * @param host Element the window mounts in.
 * @returns Example, or null when cancelled.
 */
export function solidScriptExamplesAsk(host: HTMLElement): Promise<SolidScriptExample | null> {
  return new Promise((resolve) => new SolidScriptExamplesDialog(host, resolve).show());
}

/**
 * The Examples window: every built-in example by group, a search box, and what
 * the selected one builds.
 */
class SolidScriptExamplesDialog extends SolidScriptDialog {
  private readonly search = document.createElement('input');
  private readonly list = document.createElement('div');
  private readonly about = document.createElement('p');
  private selected: SolidScriptExample | null = null;

  /**
   * Builds the window.
   *
   * @param host Element the window mounts in.
   * @param settle Receives the choice.
   */
  constructor(
    host: HTMLElement,
    private readonly settle: (example: SolidScriptExample | null) => void,
  ) {
    super(host, 'Examples', 'Open');
    this.root.dataset['solidScriptExamples'] = '';
    this.content.append(this.note('Open an example as a new script. Undo brings your script back.'));
    this.search.type = 'search';
    this.search.className = SOLID_SCRIPT_EDITOR_CLASSES.input;
    this.search.placeholder = 'Search Examples';
    this.search.setAttribute('aria-label', 'Search examples');
    this.search.style.marginBottom = '10px';
    this.search.addEventListener('input', () => this.listRefresh());
    this.list.className = SOLID_SCRIPT_EDITOR_CLASSES.list;
    this.list.setAttribute('role', 'listbox');
    this.list.style.maxHeight = '300px';
    Object.assign(this.about.style, { minHeight: '34px', margin: '0 0 14px', lineHeight: '1.4' });
    this.content.append(this.search, solidScriptScrollerWrap(this.list, '0 0 auto', 0), this.about, this.buttonRow());
    this.listRefresh();
  }

  /** Focuses the search box. */
  protected override onAfterShow(): void {
    this.search.focus();
  }

  /**
   * Hands over the selected example.
   *
   * @returns True to close.
   */
  protected confirm(): boolean {
    this.settle(this.selected);
    return this.selected !== null;
  }

  /** Hands over nothing. */
  protected cancel(): void {
    this.settle(null);
  }

  /** Lists the examples that match the search, under their groups. */
  private listRefresh(): void {
    const found = solidScriptExamplesFind(this.search.value);
    if (!this.selected || !found.includes(this.selected)) this.selected = found[0] ?? null;
    const rows: HTMLElement[] = [];
    for (const group of SOLID_SCRIPT_EXAMPLE_GROUPS) {
      const members = found.filter((example) => example.group === group);
      if (members.length === 0) continue;
      rows.push(this.heading(group), ...members.map((example) => this.item(example)));
    }
    if (rows.length === 0) rows.push(this.heading('No example matches.'));
    this.list.replaceChildren(...rows);
    this.about.textContent = this.selected
      ? `${this.selected.summary} ${this.selected.lines.length} lines.`
      : 'Try another word.';
    this.confirmEnable(this.selected !== null);
  }

  /**
   * Builds a group heading.
   *
   * @param text Heading.
   * @returns Element.
   */
  private heading(text: string): HTMLElement {
    const heading = document.createElement('div');
    heading.textContent = text;
    Object.assign(heading.style, {
      padding: '6px 10px 2px',
      fontWeight: '700',
      color: ThemeCss.mutedTextColor,
      cursor: 'default',
    });
    return heading;
  }

  /**
   * Builds an example row.
   *
   * @param example Example.
   * @returns Element.
   */
  private item(example: SolidScriptExample): HTMLElement {
    const item = document.createElement('div');
    item.className = SOLID_SCRIPT_EDITOR_CLASSES.listItem;
    item.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.selected, example === this.selected);
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(example === this.selected));
    item.dataset['solidScriptExample'] = example.id;
    item.textContent = example.name;
    item.title = example.summary;
    item.addEventListener('click', () => {
      this.selected = example;
      this.listRefresh();
    });
    item.addEventListener('dblclick', () => {
      this.selected = example;
      this.confirmRequest();
    });
    return item;
  }
}
