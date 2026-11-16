import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import { dialogCardButton } from '@/ui/dialog/dialog_card.js';
import { SOLID_SCRIPT_FILE_EXTENSION } from '@/solid_script/file/solid_script_file.js';
import { solidScriptProjectNameOf } from '@/solid_script/file/solid_script_file_project.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { SolidScriptDialog } from './solid_script_dialog.js';

/** What the file dialog was asked for. */
export type SolidScriptFileChoice =
  { kind: 'project'; name: string } | { kind: 'download'; name: string } | { kind: 'disk' } | null;

/** Whether the dialog saves or loads. */
type SolidScriptFileDialogMode = 'save' | 'load';

/**
 * Asks where to save a script: a name in the project's AiWorldEd/Scripts, or a
 * download.
 *
 * @param host Element the dialog mounts in.
 * @param files Scripts already saved in the project, or null without a project.
 * @param name Suggested name.
 * @returns Choice, or null when cancelled.
 */
export function solidScriptFileSaveAsk(
  host: HTMLElement,
  files: string[] | null,
  name: string,
): Promise<SolidScriptFileChoice> {
  return new Promise((resolve) => new SolidScriptFileDialog(host, 'save', files, name, resolve).show());
}

/**
 * Asks which script to load: one saved in the project, or a file from disk.
 *
 * @param host Element the dialog mounts in.
 * @param files Scripts saved in the project, or null without a project.
 * @returns Choice, or null when cancelled.
 */
export function solidScriptFileLoadAsk(host: HTMLElement, files: string[] | null): Promise<SolidScriptFileChoice> {
  return new Promise((resolve) => new SolidScriptFileDialog(host, 'load', files, '', resolve).show());
}

/** Save and load dialog of scripts. */
class SolidScriptFileDialog extends SolidScriptDialog {
  private readonly list = document.createElement('div');
  private readonly nameInput = document.createElement('input');
  private selected: string | null = null;

  /**
   * Builds the dialog.
   *
   * @param host Element the dialog mounts in.
   * @param mode Save or load.
   * @param files Saved scripts, or null without a project.
   * @param name Suggested name.
   * @param settle Receives the choice.
   */
  constructor(
    host: HTMLElement,
    private readonly mode: SolidScriptFileDialogMode,
    private readonly files: string[] | null,
    name: string,
    private readonly settle: (choice: SolidScriptFileChoice) => void,
  ) {
    super(host, mode === 'save' ? 'Save Script' : 'Load Script', mode === 'save' ? 'Save' : 'Load');
    this.root.dataset['solidScriptFileDialog'] = mode;
    this.content.append(this.note(this.description()));
    this.list.className = SOLID_SCRIPT_EDITOR_CLASSES.list;
    this.list.setAttribute('role', 'listbox');
    this.content.append(solidScriptScrollerWrap(this.list, '0 0 auto', 0));
    if (mode === 'save') this.content.append(this.nameRow(name));
    const other =
      mode === 'save'
        ? dialogCardButton('Download', false, () =>
            this.finish({ kind: 'download', name: this.nameInput.value.trim() }),
          )
        : dialogCardButton('From Disk…', false, () => this.finish({ kind: 'disk' }));
    this.content.append(this.buttonRow(other));
    this.listRefresh();
  }

  /** Focuses the name or the list. */
  protected override onAfterShow(): void {
    if (this.mode === 'save') this.nameInput.select();
    (this.mode === 'save' ? this.nameInput : this.confirmButton).focus();
  }

  /**
   * Saves or loads the chosen script.
   *
   * @returns True to close.
   */
  protected confirm(): boolean {
    const name = this.mode === 'save' ? this.nameInput.value.trim() : (this.selected ?? '');
    this.settle({ kind: 'project', name });
    return true;
  }

  /** Reports the cancel. */
  protected cancel(): void {
    this.settle(null);
  }

  /**
   * Settles with another choice and closes.
   *
   * @param choice Choice.
   */
  private finish(choice: SolidScriptFileChoice): void {
    this.settle(choice);
    this.close();
  }

  /**
   * Explains where scripts go.
   *
   * @returns Text.
   */
  private description(): string {
    if (this.files === null)
      return 'Open a project folder to keep scripts in it. Without one, scripts are downloaded and loaded from disk.';
    return `Scripts are .${SOLID_SCRIPT_FILE_EXTENSION} files in this project's AiWorldEd/Scripts folder.`;
  }

  /**
   * Builds the name row of the save dialog.
   *
   * @param name Suggested name.
   * @returns Row.
   */
  private nameRow(name: string): HTMLElement {
    const row = document.createElement('div');
    row.className = SOLID_SCRIPT_EDITOR_CLASSES.field;
    const caption = document.createElement('span');
    caption.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldLabel;
    caption.textContent = 'Name';
    this.nameInput.type = 'text';
    this.nameInput.className = SOLID_SCRIPT_EDITOR_CLASSES.input;
    this.nameInput.value = name;
    this.nameInput.setAttribute('aria-label', 'Script name');
    this.nameInput.addEventListener('input', () => this.buttonsRefresh());
    row.append(caption, this.nameInput);
    row.style.marginBottom = '14px';
    return row;
  }

  /** Lists the saved scripts. */
  private listRefresh(): void {
    const files = this.files ?? [];
    const rows = files.map((fileName) => this.listItem(fileName));
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = SOLID_SCRIPT_EDITOR_CLASSES.listItem;
      empty.textContent = this.files === null ? 'No project folder is open.' : 'No scripts saved yet.';
      empty.style.cursor = 'default';
      rows.push(empty);
    }
    this.list.replaceChildren(...rows);
    this.buttonsRefresh();
  }

  /**
   * Builds the entry of one saved script.
   *
   * @param fileName File name.
   * @returns Entry.
   */
  private listItem(fileName: string): HTMLElement {
    const item = document.createElement('div');
    item.className = SOLID_SCRIPT_EDITOR_CLASSES.listItem;
    item.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.selected, fileName === this.selected);
    item.setAttribute('role', 'option');
    item.dataset['solidScriptFile'] = fileName;
    item.textContent = solidScriptProjectNameOf(fileName);
    item.title = fileName;
    item.addEventListener('click', () => this.select(fileName));
    item.addEventListener('dblclick', () => this.confirmRequest());
    return item;
  }

  /**
   * Selects a saved script.
   *
   * @param fileName File name.
   */
  private select(fileName: string): void {
    this.selected = fileName;
    if (this.mode === 'save') this.nameInput.value = solidScriptProjectNameOf(fileName);
    this.listRefresh();
  }

  /** Enables the main button once there is something to save or load. */
  private buttonsRefresh(): void {
    const ready = this.mode === 'save' ? this.nameInput.value.trim() !== '' : this.selected !== null;
    this.confirmEnable(this.files !== null && ready);
  }
}
