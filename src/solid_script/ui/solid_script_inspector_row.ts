import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import type { ModifierStackActionTarget, ModifierStackWidget } from '@/modifier/stack/modifier_stack_types.js';
import {
  modifierStackUiRow,
  modifierStackUiText,
  modifierStackUiTextButton,
} from '@/modifier/stack/ui/modifier_stack_ui_style.js';
import { modifierStackUiPaint } from '@/modifier/stack/ui/modifier_stack_ui_paint.js';
import { ThemeCss } from '@/ui/theme/theme_ui_css_variables.js';
import {
  solidScriptDocumentNormalize,
  solidScriptDocumentUseProblem,
  solidScriptDocumentUses,
  type SolidScriptDocument,
  type SolidScriptUse,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptErrorText } from '@/solid_script/language/solid_script_error.js';
import {
  solidScriptProgramEvaluate,
  type SolidScriptProgramOptions,
} from '@/solid_script/language/solid_script_program.js';
import { solidScriptOutputSolids } from '@/solid_script/language/solid_script_output_solids.js';
import { modifierStackSolidScriptRunStart } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_received.js';
import { SOLID_SCRIPT_FILE_EXTENSION } from '@/solid_script/file/solid_script_file.js';
import { solidScriptEditorIcon } from './solid_script_editor_icons.js';
import { solidScriptInspectorInputValues } from './solid_script_inspector_inputs.js';
import { solidScriptFileDropBind, type SolidScriptFileDropResult } from './solid_script_file_drop.js';

/** Builds what the row's buttons act on, with a status line. */
type SolidScriptInspectorTargetOf = (status: (text: string) => void) => ModifierStackActionTarget | null;

/** Hover text of the script row. */
const SOLID_SCRIPT_INSPECTOR_HINT = `The script this generator runs. Edit Script opens the editor; drop an .${SOLID_SCRIPT_FILE_EXTENSION} file from the project browser here to use it.`;

/**
 * Builds the script row of a SolidScript generator, its first inspector entry:
 * the script's name and size, a message area (why the script may not be used
 * here, then its error in red below), Edit Script and Load buttons, and a drop
 * target for script files from the project browser or the desktop.
 *
 * @param targetOf Builds what the row acts on.
 * @param key Parameter key of the script.
 * @param inputsKey Parameter key of the values of its Input lines.
 * @param use How this step uses its script; a script that does not allow it is
 *   refused with the reason.
 * @returns Inspector row.
 */
export function solidScriptInspectorRow(
  targetOf: SolidScriptInspectorTargetOf,
  key: string,
  inputsKey: string,
  use: SolidScriptUse,
): ModifierStackWidget {
  const card = solidScriptInspectorCard();
  const parts = solidScriptInspectorParts();
  const { warn } = parts.messages;
  const commit = (document: SolidScriptDocument): void => {
    const problem = solidScriptDocumentUseProblem(document, use);
    if (problem) warn(problem);
    else solidScriptInspectorCommit(targetOf(warn), key, document);
  };
  card.append(parts.name, parts.detail, parts.messages.element, solidScriptInspectorButtons(targetOf, warn, commit));
  solidScriptFileDropBind(card, ThemeCss.accentColor, (result) => solidScriptInspectorDropped(result, commit, warn));
  const write = (parameters: Record<string, unknown>): void => {
    const target = targetOf(() => {});
    const start = target ? modifierStackSolidScriptRunStart(target.volume, target.stepId, use) : {};
    const inputs = solidScriptInspectorInputValues(parameters[inputsKey]);
    solidScriptInspectorWrite(parts, solidScriptDocumentNormalize(parameters[key]), use, { ...start, inputs });
  };
  return { element: modifierStackUiRow('Script', card, SOLID_SCRIPT_INSPECTOR_HINT), write };
}

/** What the script row shows: name, size line and message area. */
interface SolidScriptInspectorParts {
  /** Name line with the script icon. */
  readonly name: HTMLElement;
  /** Size line. */
  readonly detail: HTMLElement;
  /** Message area. */
  readonly messages: SolidScriptInspectorMessages;
}

/**
 * Builds the empty name line, size line and message area of the script row.
 *
 * @returns Parts.
 */
function solidScriptInspectorParts(): SolidScriptInspectorParts {
  const name = modifierStackUiText('div', '');
  Object.assign(name.style, { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' });
  return { name, detail: modifierStackUiText('div', '', true), messages: solidScriptInspectorMessages() };
}

/**
 * Shows a stored script in the row: its name, its size, why it may not be used
 * here, and its error.
 *
 * @param parts Parts of the row.
 * @param document Stored script.
 * @param use How this step uses its script.
 * @param options Values of its Input lines and what the step's run starts from.
 */
function solidScriptInspectorWrite(
  parts: SolidScriptInspectorParts,
  document: SolidScriptDocument,
  use: SolidScriptUse,
  options: SolidScriptProgramOptions,
): void {
  parts.name.replaceChildren(solidScriptEditorIcon('script'), document.name || 'Script');
  parts.messages.warn(solidScriptDocumentUseProblem(document, use));
  solidScriptInspectorDetail(parts.detail, parts.messages.fail, document, options);
}

/**
 * Builds the Can Be Used As checkboxes. The use of this step stays on, and at
 * least one stays on, so a script is never stored where it may not run.
 *
 * @param use How this step uses its script.
 * @param show Writes the status line.
 * @param commit Stores the script with new uses.
 * @returns Row and how to show a script's uses.
 */
export function solidScriptInspectorUses(
  use: SolidScriptUse,
  show: (text: string) => void,
  commit: (uses: { generator: boolean; modifier: boolean }) => void,
): { element: HTMLElement; write: (document: SolidScriptDocument) => void } {
  const element = document.createElement('div');
  element.dataset['solidScriptUses'] = 'true';
  Object.assign(element.style, { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' });
  const caption = modifierStackUiText('span', 'Can Be Used As', true);
  element.append(caption);
  const boxes = new Map<SolidScriptUse, HTMLInputElement>();
  const read = (): { generator: boolean; modifier: boolean } => ({
    generator: boxes.get('generator')!.checked,
    modifier: boxes.get('modifier')!.checked,
  });
  for (const [each, label, hint] of [
    ['generator', 'Generator', 'Makes new geometry from nothing, in a generator node'],
    ['modifier', 'Modifier', 'Works on the brush, mesh or group it is added to'],
  ] as const) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', `Can Be Used As ${label}`);
    box.dataset['solidScriptUse'] = each;
    box.addEventListener('change', () => {
      if (!box.checked && each === use) {
        box.checked = true;
        show(`This script is used as a ${use} here, so ${label} stays on.`);
        return;
      }
      commit(read());
    });
    boxes.set(each, box);
    const wrap = document.createElement('label');
    wrap.title = hint;
    Object.assign(wrap.style, { display: 'flex', gap: '4px', alignItems: 'center' });
    wrap.append(box, label);
    element.append(wrap);
  }
  const write = (script: SolidScriptDocument): void => {
    const uses = solidScriptDocumentUses(script);
    boxes.get('generator')!.checked = uses.generator;
    boxes.get('modifier')!.checked = uses.modifier;
  };
  return { element, write };
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
 * Shows the size of a script and how many solids it builds, or its error in the
 * message area when it stops.
 *
 * @param element Detail line.
 * @param fail Shows the script's error, or hides it when empty.
 * @param document Script.
 * @param options Values of its Input lines and what the step's run starts from.
 */
function solidScriptInspectorDetail(
  element: HTMLElement,
  fail: (text: string) => void,
  document: SolidScriptDocument,
  options: SolidScriptProgramOptions,
): void {
  const lines = `${document.blocks.length} ${document.blocks.length === 1 ? 'line' : 'lines'}`;
  try {
    const result = solidScriptProgramEvaluate(document, { ...options, context: 'preview' });
    element.textContent = `${lines} · ${solidScriptOutputSolids(result.steps.length, result.ms)}`;
    fail('');
  } catch (error) {
    element.textContent = lines;
    fail(solidScriptErrorText(error));
  }
}

/** The row's message area: the use warning, with the script's error below it. */
interface SolidScriptInspectorMessages {
  /** Area element. */
  readonly element: HTMLElement;
  /**
   * Shows a warning, such as why the script may not be used here, or hides it
   * when empty.
   */
  readonly warn: (text: string) => void;
  /** Shows the script's error in red, or hides it when empty. */
  readonly fail: (text: string) => void;
}

/**
 * Builds the message area of the script row. It shows nothing until a message
 * is set; a warning always sits above the error.
 *
 * @returns Area and how to set its messages.
 */
function solidScriptInspectorMessages(): SolidScriptInspectorMessages {
  const element = document.createElement('div');
  element.dataset['solidScriptMessages'] = 'true';
  Object.assign(element.style, { display: 'flex', flexDirection: 'column', gap: '2px' });
  const warning = solidScriptInspectorMessage('text');
  const error = solidScriptInspectorMessage('error');
  error.dataset['solidScriptError'] = 'true';
  element.append(warning, error);
  return {
    element,
    warn: (text) => solidScriptInspectorMessageShow(warning, text),
    fail: (text) => solidScriptInspectorMessageShow(error, text),
  };
}

/**
 * Builds one hidden message line in the inspector's text style.
 *
 * @param role Theme role of its text: plain or error red.
 * @returns Message line.
 */
function solidScriptInspectorMessage(role: 'text' | 'error'): HTMLElement {
  const element = modifierStackUiPaint(modifierStackUiText('div', '', true), role);
  element.style.display = 'none';
  return element;
}

/**
 * Sets a message line, hiding it when the text is empty.
 *
 * @param element Message line.
 * @param text Message, or empty.
 */
function solidScriptInspectorMessageShow(element: HTMLElement, text: string): void {
  element.textContent = text;
  element.style.display = text === '' ? 'none' : '';
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
