import {
  SOLID_SCRIPT_DOCUMENT_VERSION,
  SOLID_SCRIPT_VERSION_LABEL,
  solidScriptDocumentAuthorWith,
  solidScriptDocumentEditModeWith,
  solidScriptDocumentUsesWith,
  solidScriptDocumentVersionRead,
  solidScriptDocumentVersionWith,
  type SolidScriptDocument,
  type SolidScriptUse,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptInspectorEditMode, solidScriptInspectorUses } from './solid_script_inspector_row.js';
import { solidScriptSettingsCheckbox, solidScriptSettingsOption } from './solid_script_editor_settings_option.js';
import { LocalSettingsStorage, type SettingsStorage } from '@/settings/storage/settings_storage.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import {
  SOLID_SCRIPT_EDITOR_VIEW_LABELS,
  solidScriptEditorViewRead,
  solidScriptEditorViewWrite,
  type SolidScriptEditorView,
} from './solid_script_editor_view.js';
import {
  SOLID_SCRIPT_EDITOR_DEBUG_SPEEDS,
  solidScriptEditorDebugSpeedMs,
  solidScriptEditorDebugSpeedRead,
  solidScriptEditorDebugSpeedWrite,
  type SolidScriptEditorDebugSpeed,
} from './solid_script_editor_debug_speed.js';

/**
 * The Settings tab of the script editor: Script Settings (the version, Can Be
 * Used As, Has Edit Mode and who wrote the script, saved with the script), then
 * Code View and Debug, which are kept on this computer.
 */
export class SolidScriptEditorSettings {
  /** Tab content. */
  readonly element = document.createElement('div');
  private readonly author = document.createElement('input');
  private readonly version: { element: HTMLElement; write: (document: SolidScriptDocument) => void };
  private readonly uses: { element: HTMLElement; write: (document: SolidScriptDocument) => void };
  private readonly editMode = solidScriptInspectorEditMode((on) =>
    this.change((script) => solidScriptDocumentEditModeWith(script, on)),
  );
  private current: SolidScriptDocument | null = null;

  /**
   * Builds the tab.
   *
   * @param use How this step uses its script; that use stays on.
   * @param commit Stores a changed script.
   * @param notice Shows a short message.
   * @param viewChanged Shows the code with changed view switches.
   * @param speedChanged Steps Debug at a new pace, in ms between steps.
   * @param storage Where the view switches and the Debug speed are kept.
   */
  constructor(
    use: SolidScriptUse,
    private readonly commit: (document: SolidScriptDocument) => void,
    notice: (text: string) => void,
    viewChanged: (view: SolidScriptEditorView) => void,
    speedChanged: (ms: number) => void,
    storage: SettingsStorage = new LocalSettingsStorage(),
  ) {
    this.element.dataset['solidScriptSettings'] = 'true';
    Object.assign(this.element.style, { display: 'grid', gap: '8px', padding: '8px 12px', alignContent: 'start' });
    this.version = solidScriptEditorSettingsVersion((version) =>
      this.change((script) => solidScriptDocumentVersionWith(script, version)),
    );
    this.uses = solidScriptInspectorUses(use, notice, (uses) =>
      this.change((script) => solidScriptDocumentUsesWith(script, uses)),
    );
    this.element.append(
      solidScriptEditorSettingsGroup(
        'Script Settings',
        'Settings saved with the script: its language, what it can be used as, whether it has Edit Mode, and who wrote it.',
        this.version.element,
        this.uses.element,
        this.editMode.element,
        solidScriptEditorSettingsAuthor(this.author, () =>
          this.change((script) => solidScriptDocumentAuthorWith(script, this.author.value)),
        ),
      ),
      solidScriptEditorSettingsView(viewChanged, storage),
      solidScriptEditorSettingsDebug(speedChanged, storage),
    );
  }

  /**
   * Shows a script's settings; a field being typed in keeps its text.
   *
   * @param script Script.
   */
  write(script: SolidScriptDocument): void {
    this.current = script;
    this.version.write(script);
    this.uses.write(script);
    this.editMode.write(script);
    if (this.author.ownerDocument.activeElement !== this.author) this.author.value = script.author ?? '';
  }

  /**
   * Stores the shown script with one setting changed.
   *
   * @param edit Changes the script.
   */
  private change(edit: (script: SolidScriptDocument) => SolidScriptDocument): void {
    if (this.current) this.commit(edit(this.current));
  }
}

/**
 * Builds a titled Settings group, the same fieldset Code View and Debug use.
 *
 * @param title Legend, such as Script Settings.
 * @param hint Hover text of the title.
 * @param items Rows inside the group.
 * @returns Group.
 */
function solidScriptEditorSettingsGroup(title: string, hint: string, ...items: HTMLElement[]): HTMLElement {
  const group = document.createElement('fieldset');
  group.className = SOLID_SCRIPT_EDITOR_CLASSES.settingsGroup;
  group.dataset['solidScriptSettingsGroup'] = title;
  const legend = document.createElement('legend');
  legend.textContent = title;
  legend.title = hint;
  group.append(legend, ...items);
  return group;
}

/**
 * Builds the Version dropdown: Solid Script 1, bound to the script's stored
 * version.
 *
 * @param commit Stores the script with the chosen version.
 * @returns Row and how to show a script's version.
 */
function solidScriptEditorSettingsVersion(commit: (version: typeof SOLID_SCRIPT_DOCUMENT_VERSION) => void): {
  element: HTMLElement;
  write: (document: SolidScriptDocument) => void;
} {
  const select = solidScriptEditorSettingsVersionSelect(commit);
  const row = solidScriptSettingsOption(
    'Which Solid Script language this script uses. Later versions may read some lines differently.',
    'Version',
    select,
  );
  return { element: row, write: (script) => void (select.value = String(script.version)) };
}

/**
 * Builds the Version menu with Solid Script 1 as its only option.
 *
 * @param commit Stores the script with the chosen version.
 * @returns Menu.
 */
function solidScriptEditorSettingsVersionSelect(
  commit: (version: typeof SOLID_SCRIPT_DOCUMENT_VERSION) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Version');
  const option = document.createElement('option');
  option.value = String(SOLID_SCRIPT_DOCUMENT_VERSION);
  option.textContent = SOLID_SCRIPT_VERSION_LABEL[SOLID_SCRIPT_DOCUMENT_VERSION];
  select.append(option);
  select.value = String(SOLID_SCRIPT_DOCUMENT_VERSION);
  select.addEventListener('change', () => commit(solidScriptDocumentVersionRead(Number(select.value))));
  return select;
}

/**
 * Builds the Author field, saved with the script.
 *
 * @param author Text field.
 * @param commit Stores the script with the typed name.
 * @returns Row.
 */
function solidScriptEditorSettingsAuthor(author: HTMLInputElement, commit: () => void): HTMLElement {
  author.type = 'text';
  author.setAttribute('aria-label', 'Author');
  author.placeholder = 'Name';
  author.addEventListener('change', commit);
  return solidScriptSettingsOption('Who wrote the script; saved with it', 'Author', author);
}

/**
 * Builds the Code View switches: a checkbox each, stored when changed.
 *
 * @param viewChanged Shows the code with changed switches.
 * @param storage Where the switches are kept.
 * @returns Group element.
 */
function solidScriptEditorSettingsView(
  viewChanged: (view: SolidScriptEditorView) => void,
  storage: SettingsStorage,
): HTMLElement {
  const view = solidScriptEditorViewRead(storage);
  const rows: HTMLElement[] = [];
  for (const [key, label, hint] of SOLID_SCRIPT_EDITOR_VIEW_LABELS) {
    const { box, element } = solidScriptSettingsCheckbox(label, hint);
    box.checked = view[key];
    box.addEventListener('change', () => {
      view[key] = box.checked;
      solidScriptEditorViewWrite(view, storage);
      viewChanged({ ...view });
    });
    rows.push(element);
  }
  return solidScriptEditorSettingsGroup('Code View', 'How this editor shows code; kept on this computer', ...rows);
}

/**
 * Builds the Debug group: how fast Debug steps through the script on its own,
 * stored when changed and used at once, even while Debug plays.
 *
 * @param speedChanged Steps Debug at a new pace, in ms between steps.
 * @param storage Where the speed is kept.
 * @returns Group element.
 */
function solidScriptEditorSettingsDebug(speedChanged: (ms: number) => void, storage: SettingsStorage): HTMLElement {
  const speed = document.createElement('select');
  speed.setAttribute('aria-label', 'Debug Speed');
  for (const [name, , words] of SOLID_SCRIPT_EDITOR_DEBUG_SPEEDS) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    option.title = words;
    speed.append(option);
  }
  speed.value = solidScriptEditorDebugSpeedRead(storage);
  speed.addEventListener('change', () => {
    const chosen = speed.value as SolidScriptEditorDebugSpeed;
    solidScriptEditorDebugSpeedWrite(chosen, storage);
    speedChanged(solidScriptEditorDebugSpeedMs(chosen));
  });
  const row = solidScriptSettingsOption(
    'How fast Debug builds one solid after the other when it plays on its own. Slow shows one solid per second, Normal about two, Fast about seven and Fastest about 25. Step still builds one solid per press.',
    'Debug Speed',
    speed,
  );
  return solidScriptEditorSettingsGroup('Debug', 'How Debug steps through the script; kept on this computer', row);
}
