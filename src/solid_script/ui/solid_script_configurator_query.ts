import type { SolidScriptCommandParameter } from '@/solid_script/commands/solid_script_command.js';
import type { SolidScriptCommandEach } from '@/solid_script/commands/solid_script_command_each.js';
import { SOLID_SCRIPT_COMMAND_EACH_ICON } from '@/solid_script/commands/solid_script_command_each.js';
import { SOLID_SCRIPT_CONDITION_HELPERS } from '@/solid_script/language/solid_script_condition_helpers.js';
import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import { solidScriptFieldAsTyped } from '@/solid_script/language/solid_script_field.js';
import { solidScriptFieldMistakeOf } from '@/solid_script/language/solid_script_field_mistakes.js';
import { solidScriptFieldKnown, solidScriptFieldUnknown } from '@/solid_script/document/solid_script_document_names.js';
import {
  solidScriptQueryCustomCreate,
  solidScriptQueryFromField,
  solidScriptQueryGroupCreate,
  solidScriptQueryHelperCreate,
  solidScriptQueryInputHidden,
  solidScriptQueryTitle,
  solidScriptQueryToField,
  type SolidScriptQueryJoin,
  type SolidScriptQueryNode,
} from '@/solid_script/language/solid_script_condition_query.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptFieldMirrorAttach } from './solid_script_field_highlight.js';
import { SolidScriptConfiguratorNames } from './solid_script_configurator_names.js';
import {
  solidScriptConfiguratorInput,
  solidScriptConfiguratorProblem,
  solidScriptConfiguratorSuggests,
  type SolidScriptConfiguratorField,
  type SolidScriptConfiguratorScope,
} from './solid_script_configurator_fields.js';
import { solidScriptEditorViewRead, type SolidScriptEditorView } from './solid_script_editor_view.js';
import type { SolidScriptSuggestionScope } from './solid_script_suggestions.js';

/** What one easy-mode Add control can insert. */
const SOLID_SCRIPT_QUERY_ADD: readonly { value: string; label: string }[] = [
  ...SOLID_SCRIPT_CONDITION_HELPERS.map((helper) => ({ value: helper.key, label: helper.display })),
  { value: 'custom', label: 'Custom' },
  { value: 'all', label: 'All Of' },
  { value: 'any', label: 'Any Of' },
];

/** Living state of one query field while the configurator is open. */
class SolidScriptConfiguratorQueryState {
  /** Suggestion scope shared by every input of the field. */
  suggest: SolidScriptSuggestionScope;
  /** Names known for warnings, updated when fills change. */
  known: ReturnType<typeof solidScriptFieldKnown>;
  /** Element the current element fills, when this is a 🔁 field. */
  each: SolidScriptCommandEach | undefined;
  /** True while Easy mode is shown. */
  easy = true;
  /** Rows of the formula. */
  tree: SolidScriptQueryNode;
  /** Suggestion lists to close and to give new fills. */
  lists: SolidScriptConfiguratorNames[] = [];
  /** Easy-mode rows host. */
  easyHost = document.createElement('div');
  /** Code-mode input of the stored field text. */
  code: HTMLInputElement;
  /** Easy and Code buttons. */
  modes: HTMLButtonElement[] = [];
  /** Suggestion list of the Code input, kept across Easy repaints. */
  codeList: SolidScriptConfiguratorNames;

  /**
   * Builds the living state of a query field, with Easy mode shown first.
   *
   * @param parameter Field.
   * @param value Stored field text.
   * @param changed Runs after every edit.
   * @param scope Names the field may refer to.
   * @param view Editor view for underlines.
   */
  constructor(
    readonly parameter: SolidScriptCommandParameter,
    value: string,
    readonly changed: () => void,
    readonly scope: SolidScriptConfiguratorScope,
    readonly view: SolidScriptEditorView,
  ) {
    this.each = parameter.each;
    this.suggest = { names: scope.names, extra: scope.extra, paths: false, words: [] };
    this.known = solidScriptFieldKnown(scope.names, scope.extra);
    this.tree = solidScriptQueryFromField(parameter.type, value);
    this.code = solidScriptConfiguratorInput(value, parameter.label);
    this.codeList = new SolidScriptConfiguratorNames(this.code, this.suggest);
    solidScriptConfiguratorQueryMirror(this, this.code);
  }
}

/**
 * Tells whether a field is a condition the query editor can show as rows: If's
 * Condition, and Where on Select and Filter List, not a word such as Scatter
 * Points' Where.
 *
 * @param parameter Field.
 * @returns True when the query editor applies.
 */
export function solidScriptConfiguratorQueryApplies(parameter: SolidScriptCommandParameter): boolean {
  return parameter.type === 'condition' || (parameter.key === 'where' && parameter.type === 'value');
}

/**
 * Builds the query editor of a condition field: Easy mode rows and a Code mode
 * for the formula. Code is the source of truth; Easy keeps hand-typed text
 * until a row is changed.
 *
 * @param parameter Field.
 * @param value Stored field text.
 * @param changed Runs after every edit.
 * @param scope Names the field may refer to.
 * @param view Editor view for underlines.
 * @returns Field.
 */
export function solidScriptConfiguratorQueryBuild(
  parameter: SolidScriptCommandParameter,
  value: string,
  changed: () => void,
  scope: SolidScriptConfiguratorScope = { names: [], extra: [] },
  view: SolidScriptEditorView = solidScriptEditorViewRead(),
): SolidScriptConfiguratorField {
  const state = new SolidScriptConfiguratorQueryState(parameter, value, changed, scope, view);
  return {
    element: solidScriptConfiguratorQueryRow(state),
    read: () => solidScriptConfiguratorQueryRead(state),
    warning: () => solidScriptConfiguratorQueryWarning(state),
    close: () => [state.codeList, ...state.lists].forEach((list) => list.close()),
    fillsSet: (extra) => solidScriptConfiguratorQueryFills(state, extra),
    choicesSet: () => {},
    problem: () => solidScriptConfiguratorQueryProblem(state),
  };
}

/**
 * Builds the labelled configurator row of a query field.
 *
 * @param state Field state.
 * @returns Row element.
 */
function solidScriptConfiguratorQueryRow(state: SolidScriptConfiguratorQueryState): HTMLElement {
  const row = document.createElement('div');
  row.className = `${SOLID_SCRIPT_EDITOR_CLASSES.field} ${SOLID_SCRIPT_EDITOR_CLASSES.fieldQuery}`;
  row.title = state.parameter.hint;
  const hint = document.createElement('span');
  hint.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldHint;
  hint.textContent = state.parameter.hint;
  const inputs = document.createElement('span');
  inputs.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldInputs;
  inputs.append(solidScriptConfiguratorQueryEditor(state));
  row.append(solidScriptConfiguratorQueryCaption(state.parameter), inputs, hint);
  return row;
}

/**
 * Builds the caption of a query field, with the 🔁 icon when the field walks an
 * element.
 *
 * @param parameter Field.
 * @returns Caption.
 */
function solidScriptConfiguratorQueryCaption(parameter: SolidScriptCommandParameter): HTMLElement {
  const caption = document.createElement('span');
  caption.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldLabel;
  if (!parameter.each) {
    caption.textContent = parameter.label;
    return caption;
  }
  const icon = document.createElement('span');
  icon.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldEachIcon;
  icon.textContent = SOLID_SCRIPT_COMMAND_EACH_ICON;
  icon.setAttribute('aria-hidden', 'true');
  caption.append(icon, document.createTextNode(parameter.label));
  return caption;
}

/**
 * Builds the Easy / Code switch and both editors.
 *
 * @param state Field state.
 * @returns Query editor.
 */
function solidScriptConfiguratorQueryEditor(state: SolidScriptConfiguratorQueryState): HTMLElement {
  const root = document.createElement('div');
  root.className = SOLID_SCRIPT_EDITOR_CLASSES.query;
  const modes = document.createElement('div');
  modes.className = SOLID_SCRIPT_EDITOR_CLASSES.queryMode;
  state.modes = (['Easy', 'Code'] as const).map((mode) => solidScriptConfiguratorQueryModeButton(state, mode, modes));
  state.easyHost.className = SOLID_SCRIPT_EDITOR_CLASSES.queryEasy;
  state.code.addEventListener('input', () => solidScriptConfiguratorQueryCodeInput(state));
  root.append(modes, state.easyHost, state.code);
  solidScriptConfiguratorQueryShow(state);
  return root;
}

/**
 * Builds one Easy or Code button.
 *
 * @param state Field state.
 * @param mode Button name.
 * @param host Button row.
 * @returns Button.
 */
function solidScriptConfiguratorQueryModeButton(
  state: SolidScriptConfiguratorQueryState,
  mode: 'Easy' | 'Code',
  host: HTMLElement,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = SOLID_SCRIPT_EDITOR_CLASSES.inputAdd;
  button.textContent = mode;
  button.setAttribute('aria-label', mode);
  button.addEventListener('click', () => solidScriptConfiguratorQueryMode(state, mode === 'Easy'));
  host.append(button);
  return button;
}

/**
 * Switches between Easy and Code, keeping the stored text when nothing was
 * edited.
 *
 * @param state Field state.
 * @param easy True for Easy mode.
 */
function solidScriptConfiguratorQueryMode(state: SolidScriptConfiguratorQueryState, easy: boolean): void {
  if (easy === state.easy) return;
  if (easy) state.tree = solidScriptQueryFromField(state.parameter.type, state.code.value);
  else state.code.value = solidScriptQueryToField(state.parameter.type, state.tree);
  state.easy = easy;
  solidScriptConfiguratorQueryShow(state);
}

/**
 * Shows Easy or Code and paints the rows of Easy mode.
 *
 * @param state Field state.
 */
function solidScriptConfiguratorQueryShow(state: SolidScriptConfiguratorQueryState): void {
  state.easyHost.hidden = !state.easy;
  state.code.hidden = state.easy;
  state.modes.forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0) === state.easy)));
  if (state.easy) solidScriptConfiguratorQueryPaint(state);
}

/**
 * Reads a change typed in Code mode into the rows, so switching back to Easy
 * shows what was typed.
 *
 * @param state Field state.
 */
function solidScriptConfiguratorQueryCodeInput(state: SolidScriptConfiguratorQueryState): void {
  if (state.easy) return;
  state.tree = solidScriptQueryFromField(state.parameter.type, state.code.value);
  state.changed();
}

/**
 * Rebuilds the Easy-mode rows from the current tree.
 *
 * @param state Field state.
 */
function solidScriptConfiguratorQueryPaint(state: SolidScriptConfiguratorQueryState): void {
  state.lists.forEach((list) => list.close());
  state.lists = [];
  state.easyHost.replaceChildren();
  if (state.tree.kind === 'group') solidScriptConfiguratorQueryPaintGroup(state, state.tree, state.easyHost, true);
}

/**
 * Paints one group of rows, with a join control and an Add control.
 *
 * @param state Field state.
 * @param group Group.
 * @param host Parent element.
 * @param root True for the outermost group.
 */
function solidScriptConfiguratorQueryPaintGroup(
  state: SolidScriptConfiguratorQueryState,
  group: Extract<SolidScriptQueryNode, { kind: 'group' }>,
  host: HTMLElement,
  root: boolean,
  remove?: () => void,
): void {
  const block = document.createElement('div');
  block.className = `${SOLID_SCRIPT_EDITOR_CLASSES.queryGroup}${root ? ` ${SOLID_SCRIPT_EDITOR_CLASSES.queryRoot}` : ''}`;
  if (remove) block.append(solidScriptConfiguratorQueryHeader(state, group, remove));
  const rows = document.createElement('div');
  rows.className = SOLID_SCRIPT_EDITOR_CLASSES.queryEasy;
  group.items.forEach((item, index) => solidScriptConfiguratorQueryPaintItem(state, group, item, index, rows));
  block.append(rows, solidScriptConfiguratorQueryBar(state, group));
  host.append(block);
}

/**
 * Paints one row of a group: a helper, Custom, or a nested group.
 *
 * @param state Field state.
 * @param group Parent group.
 * @param item Row.
 * @param index Index in the group.
 * @param host Rows host.
 */
function solidScriptConfiguratorQueryPaintItem(
  state: SolidScriptConfiguratorQueryState,
  group: Extract<SolidScriptQueryNode, { kind: 'group' }>,
  item: SolidScriptQueryNode,
  index: number,
  host: HTMLElement,
): void {
  const remove = () => solidScriptConfiguratorQueryRemove(state, group, index);
  if (item.kind === 'group') solidScriptConfiguratorQueryPaintGroup(state, item, host, false, remove);
  else solidScriptConfiguratorQueryPaintRow(state, item, host, remove);
}

/**
 * Paints a helper or Custom row with its header and inputs.
 *
 * @param state Field state.
 * @param item Row.
 * @param host Rows host.
 * @param remove Removes the row.
 */
function solidScriptConfiguratorQueryPaintRow(
  state: SolidScriptConfiguratorQueryState,
  item: Extract<SolidScriptQueryNode, { kind: 'helper' | 'custom' }>,
  host: HTMLElement,
  remove: () => void,
): void {
  const row = document.createElement('div');
  row.append(solidScriptConfiguratorQueryHeader(state, item, remove));
  row.append(
    item.kind === 'helper'
      ? solidScriptConfiguratorQueryInputs(state, item)
      : solidScriptConfiguratorQueryCustom(state, item),
  );
  host.append(row);
}

/**
 * Builds the title, Not and Remove controls of a row or nested group.
 *
 * @param state Field state.
 * @param node Row.
 * @param remove Removes the row.
 * @returns Header.
 */
function solidScriptConfiguratorQueryHeader(
  state: SolidScriptConfiguratorQueryState,
  node: SolidScriptQueryNode,
  remove: () => void,
): HTMLElement {
  const head = document.createElement('div');
  head.className = SOLID_SCRIPT_EDITOR_CLASSES.queryHead;
  const title = document.createElement('span');
  title.className = SOLID_SCRIPT_EDITOR_CLASSES.queryTitle;
  title.textContent = solidScriptQueryTitle(node, state.each);
  head.append(
    title,
    solidScriptConfiguratorQueryToggle(state, node, title, 'Not', () => !node.not),
    solidScriptConfiguratorQueryAction('Remove', remove),
  );
  return head;
}

/**
 * Builds a compact action button.
 *
 * @param label Accessible name and caption.
 * @param press Click handler.
 * @returns Button.
 */
function solidScriptConfiguratorQueryAction(label: string, press: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = SOLID_SCRIPT_EDITOR_CLASSES.inputAdd;
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', press);
  return button;
}

/**
 * Builds a pressed toggle, such as Not, that marks the row dirty and updates
 * its title.
 *
 * @param state Field state.
 * @param node Row.
 * @param title Title element.
 * @param label Accessible name.
 * @param next Next pressed value from the current node.
 * @returns Button.
 */
function solidScriptConfiguratorQueryToggle(
  state: SolidScriptConfiguratorQueryState,
  node: SolidScriptQueryNode,
  title: HTMLElement,
  label: string,
  next: () => boolean,
): HTMLButtonElement {
  const button = solidScriptConfiguratorQueryAction(label, () => {
    node.not = next();
    node.dirty = true;
    button.setAttribute('aria-pressed', String(node.not));
    title.textContent = solidScriptQueryTitle(node, state.each);
    state.changed();
  });
  button.setAttribute('aria-pressed', String(node.not));
  return button;
}

/**
 * Builds the join select and Add control of a group.
 *
 * @param state Field state.
 * @param group Group.
 * @returns Bar.
 */
function solidScriptConfiguratorQueryBar(
  state: SolidScriptConfiguratorQueryState,
  group: Extract<SolidScriptQueryNode, { kind: 'group' }>,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = SOLID_SCRIPT_EDITOR_CLASSES.queryHead;
  bar.append(solidScriptConfiguratorQueryJoin(state, group), solidScriptConfiguratorQueryAdd(state, group));
  return bar;
}

/**
 * Builds the All Of / Any Of select of a group.
 *
 * @param state Field state.
 * @param group Group.
 * @returns Select.
 */
function solidScriptConfiguratorQueryJoin(
  state: SolidScriptConfiguratorQueryState,
  group: Extract<SolidScriptQueryNode, { kind: 'group' }>,
): HTMLSelectElement {
  return solidScriptConfiguratorQueryChoice(
    'Join',
    group.join,
    [
      ['all', 'All Of'],
      ['any', 'Any Of'],
    ],
    (select) => {
      group.join = select.value as SolidScriptQueryJoin;
      group.dirty = true;
      solidScriptConfiguratorQueryPaint(state);
      state.changed();
    },
  );
}

/**
 * Builds a labelled select of named choices.
 *
 * @param label Accessible name.
 * @param value Current value.
 * @param choices Value and caption of each option.
 * @param write Runs after the selection changes.
 * @returns Select.
 */
function solidScriptConfiguratorQueryChoice(
  label: string,
  value: string,
  choices: readonly (readonly [string, string])[],
  write: (select: HTMLSelectElement) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = SOLID_SCRIPT_EDITOR_CLASSES.input;
  select.setAttribute('aria-label', label);
  for (const [choice, text] of choices) {
    const option = document.createElement('option');
    option.value = choice;
    option.textContent = text;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => write(select));
  return select;
}

/**
 * Builds the Add select that inserts a helper, Custom, or a nested group.
 *
 * @param state Field state.
 * @param group Group to add to.
 * @returns Select.
 */
function solidScriptConfiguratorQueryAdd(
  state: SolidScriptConfiguratorQueryState,
  group: Extract<SolidScriptQueryNode, { kind: 'group' }>,
): HTMLSelectElement {
  const choices: (readonly [string, string])[] = [
    ['', 'Add'],
    ...SOLID_SCRIPT_QUERY_ADD.map((entry) => [entry.value, entry.label] as const),
  ];
  const select = solidScriptConfiguratorQueryChoice('Add', '', choices, () => {
    if (select.value !== '') solidScriptConfiguratorQueryInsert(state, group, select.value);
    select.value = '';
  });
  return select;
}

/**
 * Inserts a new row or nested group and repaints Easy mode.
 *
 * @param state Field state.
 * @param group Group to add to.
 * @param value Helper key, custom, all, or any.
 */
function solidScriptConfiguratorQueryInsert(
  state: SolidScriptConfiguratorQueryState,
  group: Extract<SolidScriptQueryNode, { kind: 'group' }>,
  value: string,
): void {
  const row =
    value === 'custom'
      ? solidScriptQueryCustomCreate()
      : value === 'all' || value === 'any'
        ? solidScriptQueryGroupCreate(value)
        : solidScriptQueryHelperCreate(value, state.each);
  group.items = [...group.items, row];
  group.dirty = true;
  solidScriptConfiguratorQueryPaint(state);
  state.changed();
}

/**
 * Removes a row from a group and repaints Easy mode.
 *
 * @param state Field state.
 * @param group Parent group.
 * @param index Row index.
 */
function solidScriptConfiguratorQueryRemove(
  state: SolidScriptConfiguratorQueryState,
  group: Extract<SolidScriptQueryNode, { kind: 'group' }>,
  index: number,
): void {
  group.items = group.items.filter((_, item) => item !== index);
  group.dirty = true;
  solidScriptConfiguratorQueryPaint(state);
  state.changed();
}

/**
 * Builds the visible inputs of a curated helper, hiding the current-element
 * defaults such as [$Face.Normal].
 *
 * @param state Field state.
 * @param node Helper row.
 * @returns Inputs.
 */
function solidScriptConfiguratorQueryInputs(
  state: SolidScriptConfiguratorQueryState,
  node: Extract<SolidScriptQueryNode, { kind: 'helper' }>,
): HTMLElement {
  const host = document.createElement('div');
  host.className = SOLID_SCRIPT_EDITOR_CLASSES.queryInputs;
  const helper = SOLID_SCRIPT_CONDITION_HELPERS.find((entry) => entry.key === node.key);
  for (const [index, input] of (helper?.inputs ?? []).entries()) {
    if (solidScriptQueryInputHidden(state.each, node.key, input.name, node.inputs[index] ?? '')) continue;
    const label = document.createElement('span');
    label.textContent = input.label;
    const write = solidScriptConfiguratorQueryInputWrite(state, node, index, host);
    host.append(
      label,
      solidScriptConfiguratorQueryField(state, input.label, node.inputs[index] ?? '', input.about, write),
    );
  }
  return host;
}

/**
 * Writes one helper input, marks the row dirty and refreshes its title.
 *
 * @param state Field state.
 * @param node Helper row.
 * @param index Input index.
 * @param host Inputs host, whose previous sibling holds the title.
 * @returns Writer.
 */
function solidScriptConfiguratorQueryInputWrite(
  state: SolidScriptConfiguratorQueryState,
  node: Extract<SolidScriptQueryNode, { kind: 'helper' }>,
  index: number,
  host: HTMLElement,
): (text: string) => void {
  return (text) => {
    node.inputs[index] = text;
    node.dirty = true;
    const title = host.previousElementSibling?.querySelector(`.${SOLID_SCRIPT_EDITOR_CLASSES.queryTitle}`);
    if (title) title.textContent = solidScriptQueryTitle(node, state.each);
    state.changed();
  };
}

/**
 * Builds the formula field of a Custom row.
 *
 * @param state Field state.
 * @param node Custom row.
 * @returns Input.
 */
function solidScriptConfiguratorQueryCustom(
  state: SolidScriptConfiguratorQueryState,
  node: Extract<SolidScriptQueryNode, { kind: 'custom' }>,
): HTMLInputElement {
  return solidScriptConfiguratorQueryField(
    state,
    'Custom',
    node.text,
    'A formula, such as [$Face.Area] > 1.',
    (text) => {
      node.text = text;
      node.dirty = true;
      state.changed();
    },
  );
}

/**
 * Builds one easy-mode text input with autocomplete, underlines and a hint.
 *
 * @param state Field state.
 * @param label Accessible name.
 * @param value Field text.
 * @param hint Hover text.
 * @param write Runs after each edit.
 * @returns Input.
 */
function solidScriptConfiguratorQueryField(
  state: SolidScriptConfiguratorQueryState,
  label: string,
  value: string,
  hint: string,
  write: (text: string) => void,
): HTMLInputElement {
  const input = solidScriptConfiguratorInput(value, label);
  input.title = hint;
  input.addEventListener('input', () => write(input.value));
  solidScriptConfiguratorQueryListen(state, input);
  return input;
}

/**
 * Attaches suggestions and unknown-name underlines to one input of the field.
 *
 * @param state Field state.
 * @param input Text input.
 */
/**
 * Underlines names the script does not define in a query input.
 *
 * @param state Field state.
 * @param input Text input.
 */
function solidScriptConfiguratorQueryMirror(state: SolidScriptConfiguratorQueryState, input: HTMLInputElement): void {
  if (solidScriptFieldAsTyped(state.parameter)) return;
  solidScriptFieldMirrorAttach(
    input,
    state.view,
    (text) => new Set(solidScriptFieldUnknown(text, state.known).map((entry) => entry.key)),
  );
}

function solidScriptConfiguratorQueryListen(state: SolidScriptConfiguratorQueryState, input: HTMLInputElement): void {
  if (!solidScriptConfiguratorSuggests(state.parameter)) return;
  state.lists.push(new SolidScriptConfiguratorNames(input, state.suggest));
  solidScriptConfiguratorQueryMirror(state, input);
}

/**
 * Reads the stored field text: Easy mode writes the rows, Code mode the typed
 * formula.
 *
 * @param state Field state.
 * @returns Stored field text.
 */
function solidScriptConfiguratorQueryRead(state: SolidScriptConfiguratorQueryState): string {
  return state.easy ? solidScriptQueryToField(state.parameter.type, state.tree) : state.code.value;
}

/**
 * Updates the fills this field offers, such as $Face in Where.
 *
 * @param state Field state.
 * @param extra Fills.
 */
function solidScriptConfiguratorQueryFills(state: SolidScriptConfiguratorQueryState, extra: readonly string[]): void {
  state.suggest.extra = extra;
  state.scope.extra = extra;
  state.known = solidScriptFieldKnown(state.scope.names, extra);
}

/**
 * Returns a note on names no line defines, or an empty string.
 *
 * @param state Field state.
 * @returns Warning.
 */
function solidScriptConfiguratorQueryWarning(state: SolidScriptConfiguratorQueryState): string {
  const text = solidScriptConfiguratorQueryRead(state);
  const raw = solidScriptFieldAsTyped(state.parameter);
  if (raw) return '';
  const mistake = solidScriptFieldMistakeOf(state.parameter, text, (name) =>
    state.known.names.has(solidScriptNameKey(name)),
  );
  if (mistake) return `${state.parameter.label}: ${mistake}`;
  const fillWarning = state.scope.eachFillWarning?.(text) ?? '';
  if (fillWarning) return fillWarning;
  return solidScriptConfiguratorQueryUnknown(state, text);
}

/**
 * Returns a note when the field uses a name or function the script does not
 * define.
 *
 * @param state Field state.
 * @param text Stored field text.
 * @returns Warning, or an empty string.
 */
function solidScriptConfiguratorQueryUnknown(state: SolidScriptConfiguratorQueryState, text: string): string {
  const unknown = solidScriptFieldUnknown(text, state.known);
  const names = unknown.filter((entry) => !entry.call).map((entry) => `[${entry.written}]`);
  const calls = unknown.filter((entry) => entry.call).map((entry) => `${entry.written}()`);
  if (names.length > 0)
    return `${state.parameter.label}: no line sets ${names.join(', ')} yet; it must exist before this line runs.`;
  return calls.length > 0 ? `${state.parameter.label}: no function is named ${calls.join(', ')}.` : '';
}

/**
 * Returns an error when the value cannot be used, or an empty string, and marks
 * invalid inputs.
 *
 * @param state Field state.
 * @returns Problem.
 */
function solidScriptConfiguratorQueryProblem(state: SolidScriptConfiguratorQueryState): string {
  const problem = solidScriptConfiguratorProblem(state.parameter, solidScriptConfiguratorQueryRead(state));
  const root = state.code.closest(`.${SOLID_SCRIPT_EDITOR_CLASSES.query}`);
  for (const input of root?.querySelectorAll('input[type="text"]') ?? [])
    input.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.invalid, problem !== '');
  return problem;
}
