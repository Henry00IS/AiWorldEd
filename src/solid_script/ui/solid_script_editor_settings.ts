import { modifierStackUiText } from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import {
  solidScriptDocumentAuthorWith,
  solidScriptDocumentEditModeWith,
  solidScriptDocumentUsesWith,
  type SolidScriptDocument,
  type SolidScriptUse,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptInspectorEditMode, solidScriptInspectorUses } from './solid_script_inspector_row.js';
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
 * The Settings tab of the script editor: Can Be Used As, the same switches as
 * the inspector, Has Edit Mode, and who wrote the script, which are saved with
 * the script; then how the editor shows code and how fast Debug steps, which
 * are kept on this computer.
 */
export class SolidScriptEditorSettings {
  /** Tab content. */
  readonly element = document.createElement('div');
  private readonly author = document.createElement('input');
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
    this.uses = solidScriptInspectorUses(use, notice, (uses) =>
      this.change((script) => solidScriptDocumentUsesWith(script, uses)),
    );
    const row = document.createElement('div');
    row.title = 'Who wrote the script; saved with it';
    Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center' });
    this.author.type = 'text';
    this.author.setAttribute('aria-label', 'Author');
    this.author.placeholder = 'Name';
    this.author.addEventListener('change', () =>
      this.change((script) => solidScriptDocumentAuthorWith(script, this.author.value)),
    );
    row.append(modifierStackUiText('span', 'Author', true), this.author);
    this.element.append(
      this.uses.element,
      this.editMode.element,
      row,
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
  const group = document.createElement('fieldset');
  group.className = SOLID_SCRIPT_EDITOR_CLASSES.settingsGroup;
  const legend = document.createElement('legend');
  legend.textContent = 'Code View';
  legend.title = 'How this editor shows code; kept on this computer';
  group.append(legend);
  const view = solidScriptEditorViewRead(storage);
  for (const [key, label, hint] of SOLID_SCRIPT_EDITOR_VIEW_LABELS) {
    const row = document.createElement('label');
    row.title = hint;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = view[key];
    box.addEventListener('change', () => {
      view[key] = box.checked;
      solidScriptEditorViewWrite(view, storage);
      viewChanged({ ...view });
    });
    row.append(box, label);
    group.append(row);
  }
  return group;
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
  const group = document.createElement('fieldset');
  group.className = SOLID_SCRIPT_EDITOR_CLASSES.settingsGroup;
  const legend = document.createElement('legend');
  legend.textContent = 'Debug';
  legend.title = 'How Debug steps through the script; kept on this computer';
  const row = document.createElement('label');
  row.title =
    'How fast Debug builds one solid after the other when it plays on its own. Slow shows one solid per second, Normal about two, Fast about seven and Fastest about 25. Step still builds one solid per press.';
  Object.assign(row.style, { display: 'flex', gap: '8px', alignItems: 'center' });
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
  row.append(modifierStackUiText('span', 'Debug Speed', true), speed);
  group.append(legend, row);
  return group;
}
