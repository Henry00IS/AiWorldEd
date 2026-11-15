import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackActionTarget, ModifierStackWidget } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackUiRow,
  modifierStackUiText,
  modifierStackUiTextButton,
} from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import {
  solidScriptDocumentNormalize,
  type SolidScriptDocument,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { SOLID_SCRIPT_FILE_EXTENSION } from '@/solid_script/file/solid_script_file.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';
import { solidScriptFileDropBind, type SolidScriptFileDropResult } from './solid_script_file_drop.js';

/** Builds what the row's buttons act on, with a status line. */
type SolidScriptInspectorTargetOf = (status: (text: string) => void) => ModifierStackActionTarget | null;

/** Hover text of the script row. */
const SOLID_SCRIPT_INSPECTOR_HINT = `The script this generator runs. Edit Script opens the editor; drop an .${SOLID_SCRIPT_FILE_EXTENSION} file from the project browser here to use it.`;

/**
 * Builds the script row of a SolidScript generator, its first inspector entry:
 * the script's name and size, Edit Script and Load buttons, and a drop target
 * for script files from the project browser or the desktop.
 *
 * @param targetOf Builds what the row acts on.
 * @param key Parameter key of the script.
 * @returns Inspector row.
 */
export function solidScriptInspectorRow(targetOf: SolidScriptInspectorTargetOf, key: string): ModifierStackWidget {
  const card = solidScriptInspectorCard();
  const name = modifierStackUiText('div', '');
  Object.assign(name.style, { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' });
  const detail = modifierStackUiText('div', '', true);
  const status = modifierStackUiText('div', '', true);
  const show = (text: string): void => void (status.textContent = text);
  const commit = (document: SolidScriptDocument): void => solidScriptInspectorCommit(targetOf(show), key, document);
  card.append(name, detail, solidScriptInspectorButtons(targetOf, show, commit), status);
  solidScriptFileDropBind(card, ThemeCss.accentColor, (result) => solidScriptInspectorDropped(result, commit, show));
  const write = (parameters: Record<string, unknown>): void => {
    const document = solidScriptDocumentNormalize(parameters[key]);
    name.replaceChildren(solidScriptEditorIcon('script'), document.name || 'Script');
    solidScriptInspectorDetail(detail, document);
  };
  return { element: modifierStackUiRow('Script', card, SOLID_SCRIPT_INSPECTOR_HINT), write };
}

/**
 * Builds the empty card that holds the row's name, details and buttons.
 *
 * @returns Card.
 */
function solidScriptInspectorCard(): HTMLElement {
  const card = document.createElement('div');
  card.dataset['solidScriptField'] = 'true';
  Object.assign(card.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '4px 0',
    borderRadius: '6px',
  });
  return card;
}

/**
 * Builds the Edit Script and Load buttons.
 *
 * @param targetOf Builds what the buttons act on.
 * @param show Writes the status line.
 * @param commit Stores a new script.
 * @returns Button row.
 */
function solidScriptInspectorButtons(
  targetOf: SolidScriptInspectorTargetOf,
  show: (text: string) => void,
  commit: (document: SolidScriptDocument) => void,
): HTMLElement {
  const buttons = document.createElement('div');
  Object.assign(buttons.style, { display: 'flex', gap: '6px' });
  const edit = modifierStackUiTextButton('Edit Script', 'Open the script editor', () => {
    const target = targetOf(show);
    if (target) void import('./solid_script_editor_open.js').then((module) => module.solidScriptEditorOpen(target));
  });
  const load = modifierStackUiTextButton('Load…', `Use a saved .${SOLID_SCRIPT_FILE_EXTENSION} file`, () => {
    void import('./solid_script_editor_files.js')
      .then((module) => module.solidScriptEditorLoad(buttons.ownerDocument.body))
      .then((document) => document && commit(document))
      .catch((error: unknown) => show(error instanceof Error ? error.message : 'Loading the script failed.'));
  });
  buttons.append(edit, load);
  return buttons;
}

/**
 * Shows the size of a script and whether it runs.
 *
 * @param element Detail line.
 * @param document Script.
 */
function solidScriptInspectorDetail(element: HTMLElement, document: SolidScriptDocument): void {
  const lines = `${document.blocks.length} ${document.blocks.length === 1 ? 'line' : 'lines'}`;
  try {
    const solids = solidScriptProgramEvaluate(document).steps.length;
    element.textContent = `${lines} · ${solids} ${solids === 1 ? 'solid' : 'solids'}`;
    element.style.color = '';
  } catch (error) {
    element.textContent = `${lines} · ${solidScriptErrorText(error)}`;
    element.style.color = '#e5484d';
  }
}

/**
 * Stores a new script as one undo step.
 *
 * @param target Generator and undo stack, or null when unavailable.
 * @param key Parameter key of the script.
 * @param document Script.
 */
function solidScriptInspectorCommit(
  target: ModifierStackActionTarget | null,
  key: string,
  document: SolidScriptDocument,
): void {
  if (!target) return;
  modifierStackParametersCommit(target.volume, target.stepId, { [key]: document }, target.commandStack);
  target.status(`Using ${document.name || 'the script'}`);
  target.refresh?.();
}

/**
 * Uses a dropped script, or says why it cannot.
 *
 * @param result Dropped script or error.
 * @param commit Stores a new script.
 * @param show Writes the status line.
 */
function solidScriptInspectorDropped(
  result: SolidScriptFileDropResult,
  commit: (document: SolidScriptDocument) => void,
  show: (text: string) => void,
): void {
  if ('error' in result) show(result.error);
  else commit(result.document);
}
