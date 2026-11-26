import { solidScriptNameKey } from '@/solid_script/language/solid_script_name_key.js';
import {
  solidScriptNameDotProblem,
  solidScriptNameIsDataWrite,
  solidScriptNameIsPositionWrite,
  solidScriptNameIsUvWrite,
} from '@/solid_script/language/solid_script_name_rules.js';
import { solidScriptFieldMistakeOf } from '@/solid_script/language/solid_script_field_mistakes.js';
import type {
  SolidScriptCommandParameter,
  SolidScriptCommandWord,
} from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { solidScriptAnchorRead } from '@/solid_script/language/solid_script_anchor.js';
import {
  solidScriptParameterPlaceholder,
  solidScriptParameterValueEffective,
} from '@/solid_script/commands/solid_script_parameter_default.js';
import {
  solidScriptFieldAsTyped,
  solidScriptFieldBoolean,
  solidScriptFieldCheck,
  solidScriptFieldSplit,
  solidScriptFieldTrim,
  solidScriptFieldVectorNote,
} from '@/solid_script/language/solid_script_field.js';
import {
  solidScriptFieldKnown,
  solidScriptFieldUnknown,
  type SolidScriptName,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptFieldMirrorAttach } from './solid_script_field_highlight.js';
import { solidScriptEditorViewRead, type SolidScriptEditorView } from './solid_script_editor_view.js';
import { SolidScriptConfiguratorNames } from './solid_script_configurator_names.js';
import { solidScriptEditorToolButton } from './solid_script_editor_icons.js';
import {
  SOLID_SCRIPT_COMMAND_EACH_ICON,
  solidScriptEachSentence,
} from '@/solid_script/commands/solid_script_command_each.js';
import { solidScriptParameterTakesDirection } from '@/solid_script/commands/solid_script_parameter_direction.js';
import { textureSelectCreate } from '@/texture/ui/texture_select.js';
import { solidScriptConfiguratorColorAttach } from './solid_script_configurator_color.js';
import { solidScriptConfiguratorCurve } from './solid_script_configurator_curve.js';
import { solidScriptSuggestionSelectedWords, type SolidScriptSuggestionScope } from './solid_script_suggestions.js';
import {
  solidScriptChoiceFieldProblem,
  solidScriptChoiceWordsForField,
} from '@/solid_script/language/solid_script_choices.js';
import type { SolidScriptInput } from '@/solid_script/language/solid_script_input.js';

/** One labelled field of the configurator. */
export interface SolidScriptConfiguratorField {
  /** Row element. */
  element: HTMLElement;
  /** Reads the value as field text. */
  read: () => string;
  /** Returns an error when the value cannot be used, or an empty string. */
  problem: () => string;
  /** Returns a note on names no line defines, or an empty string. */
  warning: () => string;
  /** Takes its suggestion lists off the page, when the window closes. */
  close: () => void;
  /**
   * Updates the names this field fills in, such as $Vertex on a Set of
   * Positions.
   */
  fillsSet: (extra: readonly string[]) => void;
  /**
   * Updates the declared choice words this field offers, such as when Set's
   * Variable becomes Brush.Mode.
   *
   * @param words Declared choice words.
   */
  choicesSet: (words: readonly SolidScriptCommandWord[]) => void;
}

/** What a field can refer to: the names of the script around the line. */
export interface SolidScriptConfiguratorScope {
  /** Names the script defines. */
  names: readonly SolidScriptName[];
  /** Names the command fills in for this field. */
  extra: readonly string[];
  /**
   * Warning when this field uses a per-element fill that only another field of
   * the line fills.
   */
  eachFillWarning?: (text: string) => string;
  /** Current values of the line, so Set Value can offer the target's words. */
  values?: () => Readonly<Record<string, string>>;
  /** Input lines of the script, for Choice inputs. */
  inputs?: readonly SolidScriptInput[];
  /**
   * Opens the formula window of a field, which writes the field text back on
   * OK; fields have no … button without it.
   */
  formula?: (parameter: SolidScriptCommandParameter, stored: string, write: (text: string) => void) => void;
  /**
   * Opens the Pick Normal window, which writes the field text; direction fields
   * offer it among their suggestions.
   */
  normal?: (write: (text: string) => void) => void;
}

/** How a field's inputs are read and checked. */
type SolidScriptConfiguratorFieldReader = Pick<SolidScriptConfiguratorField, 'read' | 'problem'>;

/** Words of a Yes or No field; a variable or formula may be typed instead. */
const SOLID_SCRIPT_CONFIGURATOR_YES_NO = [
  { word: 'Yes', detail: 'On' },
  { word: 'No', detail: 'Off' },
];

/**
 * Returns how many values a vector field takes.
 *
 * @param parameter Parameter.
 * @returns 3, 2, or 0 for fields that are not vectors.
 */
function solidScriptConfiguratorVectorSize(parameter: SolidScriptCommandParameter): number {
  return parameter.type === 'vector3' ? 3 : parameter.type === 'vector2' ? 2 : 0;
}

/**
 * Lists the resources of one kind the script has, as fields write them, such as
 * $Resources.Wall.
 *
 * @param names Names the line sees.
 * @param kind Texture, Curve or Path.
 * @returns Names.
 */
function solidScriptConfiguratorResources(names: readonly SolidScriptName[], kind: string): string[] {
  return names.filter((name) => name.category === 'Resources' && name.kinds?.includes(kind)).map((name) => name.name);
}

/** Input types whose Default can be a resource of the script. */
const SOLID_SCRIPT_CONFIGURATOR_RESOURCE_TYPES: readonly string[] = ['Curve', 'Path', 'Texture'];

/**
 * Lists the resources an Input's Default can pick: those of the Input's type,
 * such as [$Resources.Arch] for a Curve.
 *
 * @param parameter Field.
 * @param values Current values of the line.
 * @param names Names the line sees.
 * @returns Words, or none when the field is no such Default.
 */
export function solidScriptConfiguratorResourceWords(
  parameter: SolidScriptCommandParameter,
  values: Readonly<Record<string, string>>,
  names: readonly SolidScriptName[],
): SolidScriptCommandWord[] {
  const type = SOLID_SCRIPT_CONFIGURATOR_RESOURCE_TYPES.find(
    (kind) => kind.toLowerCase() === values['type']?.trim().toLowerCase(),
  );
  if (parameter.key !== 'default' || type === undefined) return [];
  return solidScriptConfiguratorResources(names, type).map((name) => ({
    word: `[${name}]`,
    detail: `${type} resource`,
  }));
}

/** Pattern of names a variable can have. */
const SOLID_SCRIPT_CONFIGURATOR_NAME = /^(\$(local|persistent)\.)?[A-Za-z_][A-Za-z0-9_]*$/i;

/**
 * Pattern of what Set can change: a variable, or an item of a list such as
 * points(2) or points().
 */
const SOLID_SCRIPT_CONFIGURATOR_TARGET = /^(\$(local|persistent)\.)?[A-Za-z_][A-Za-z0-9_]*(\.[xyz]|\s*\(.*\))?$/i;

/**
 * Name groups a field naming a variable the line writes offers. Inputs are left
 * out, as lines only read them.
 */
const SOLID_SCRIPT_CONFIGURATOR_WRITABLE_GROUPS: readonly string[] = [
  'Variables',
  'Lists',
  'Counters',
  'Locals',
  'Persistent',
];

/**
 * Warns when a field that names an Input, such as the Writes of a Widget Slider
 * or the Input of Set Input, names one the script does not have.
 *
 * @param parameter Parameter.
 * @param text Field text.
 * @param names Names the line sees.
 * @returns Warning, or an empty string.
 */
function solidScriptConfiguratorInputWarning(
  parameter: SolidScriptCommandParameter,
  text: string,
  names: readonly SolidScriptName[],
): string {
  const name = text.trim();
  if (parameter.nameGroups?.join() !== 'Inputs' || name === '' || name.includes('[')) return '';
  const key = solidScriptNameKey(name);
  if (names.some((entry) => entry.category === 'Inputs' && solidScriptNameKey(entry.name) === key)) return '';
  return `${parameter.label}: there is no Input named ${name}; add an Input line for it.`;
}

/**
 * Tells which name groups of the script a field offers: the ones it asks for,
 * or the writable ones for a field naming a variable the line writes.
 *
 * @param parameter Parameter.
 * @returns Groups, or undefined when the field offers no names of the script.
 */
function solidScriptConfiguratorNameGroups(parameter: SolidScriptCommandParameter): readonly string[] | undefined {
  const variable = parameter.writes && parameter.writes.gives.rule !== 'defines';
  return parameter.nameGroups ?? (variable ? SOLID_SCRIPT_CONFIGURATOR_WRITABLE_GROUPS : undefined);
}

/**
 * Lists the words a field offers first: names of the script from its groups,
 * each once, with the [$Selected.*] lists for a whole path a Set writes; Yes
 * and No for a switch; or the field's own words.
 *
 * @param parameter Parameter.
 * @param names Names the line sees.
 * @returns Words.
 */
function solidScriptConfiguratorWords(
  parameter: SolidScriptCommandParameter,
  names: readonly SolidScriptName[],
): readonly SolidScriptCommandWord[] {
  const groups = solidScriptConfiguratorNameGroups(parameter);
  if (groups === undefined)
    return parameter.type === 'boolean' ? SOLID_SCRIPT_CONFIGURATOR_YES_NO : (parameter.words ?? []);
  const words = new Map<string, SolidScriptCommandWord>();
  for (const entry of names)
    if (groups.includes(entry.category) && !words.has(entry.name.toLowerCase()))
      words.set(entry.name.toLowerCase(), { word: entry.name, detail: entry.reaches ?? entry.detail });
  const selected = parameter.writes?.offers === 'path' ? solidScriptSuggestionSelectedWords() : [];
  return [...words.values(), ...selected];
}

/**
 * Builds the field of one command parameter.
 *
 * @param parameter Parameter.
 * @param value Stored field text.
 * @param changed Runs after every edit.
 * @param scope Names the field may refer to.
 * @returns Field.
 */
export function solidScriptConfiguratorFieldBuild(
  parameter: SolidScriptCommandParameter,
  value: string,
  changed: () => void,
  scope: SolidScriptConfiguratorScope = { names: [], extra: [] },
  view: SolidScriptEditorView = solidScriptEditorViewRead(),
): SolidScriptConfiguratorField {
  // Not a <label>: a click that starts in one input and ends in another lands on
  // the row, and a label would then focus its first input. The inputs carry
  // their own names, so a click on the caption does nothing.
  const row = document.createElement('div');
  row.className = SOLID_SCRIPT_EDITOR_CLASSES.field;
  row.title = parameter.hint;
  const caption = document.createElement('span');
  caption.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldLabel;
  if (parameter.each) {
    const icon = document.createElement('span');
    icon.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldEachIcon;
    icon.textContent = SOLID_SCRIPT_COMMAND_EACH_ICON;
    icon.setAttribute('aria-hidden', 'true');
    icon.title = solidScriptEachSentence(parameter.each);
    caption.append(icon, document.createTextNode(parameter.label));
  } else caption.textContent = parameter.label;
  const inputs = document.createElement('span');
  inputs.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldInputs;
  const field = solidScriptConfiguratorInputs(parameter, value, inputs, scope.names);
  const wordsOf = (): readonly SolidScriptCommandWord[] => {
    const base = solidScriptConfiguratorWords(parameter, scope.names);
    if (base.length > 0 && parameter.words === undefined && parameter.type !== 'boolean') return base;
    const values = scope.values?.() ?? {};
    const resources = solidScriptConfiguratorResourceWords(parameter, values, scope.names);
    if (resources.length > 0) return resources;
    const extra = solidScriptChoiceWordsForField(parameter, values, field.read(), scope.inputs ?? []);
    return extra.length > 0 ? extra : base;
  };
  const named = solidScriptConfiguratorWords(parameter, scope.names);
  const words = wordsOf();
  const suggest: SolidScriptSuggestionScope = {
    names: scope.names,
    extra: scope.extra,
    paths: parameter.writes?.offers === 'path',
    words,
    phrase: parameter.type === 'condition' || parameter.key === 'where',
    reference: parameter.reference === true,
    direction: solidScriptParameterTakesDirection(parameter),
  };
  let known = solidScriptFieldKnown(scope.names, scope.extra);
  const texts = solidScriptConfiguratorSuggests(parameter)
    ? [...inputs.querySelectorAll<HTMLInputElement>('input[type="text"]')]
    : [];
  const lists = texts.map((input) => new SolidScriptConfiguratorNames(input, suggest, scope.normal));
  inputs.addEventListener('input', changed);
  inputs.addEventListener('change', changed);
  const raw = solidScriptFieldAsTyped(parameter);
  if (!raw)
    for (const input of texts)
      solidScriptFieldMirrorAttach(
        input,
        view,
        (text) => new Set(solidScriptFieldUnknown(text, known).map((entry) => entry.key)),
      );
  const choice = (): string => {
    const declared = solidScriptChoiceWordsForField(
      parameter,
      scope.values?.() ?? {},
      field.read(),
      scope.inputs ?? [],
    );
    const problem = solidScriptChoiceFieldProblem(parameter, field.read(), declared);
    return problem ? `${parameter.label} ${problem}` : '';
  };
  const warning = (): string => {
    if (raw)
      return (
        solidScriptConfiguratorInputWarning(parameter, field.read(), scope.names) || (words.length > 0 ? choice() : '')
      );
    const sees = (name: string): boolean => known.names.has(solidScriptNameKey(name));
    const mistake = solidScriptFieldMistakeOf(parameter, field.read(), sees, sees);
    if (mistake) return `${parameter.label}: ${mistake}`;
    if (choice()) return choice();
    const note = solidScriptConfiguratorVectorSize(parameter) > 0 ? solidScriptFieldVectorNote(field.read()) : '';
    if (note) return `${parameter.label}: ${note}.`;
    const fillWarning = scope.eachFillWarning?.(field.read()) ?? '';
    if (fillWarning) return fillWarning;
    const unknown = solidScriptFieldUnknown(field.read(), known);
    const names = unknown.filter((entry) => !entry.call).map((entry) => `[${entry.written}]`);
    const calls = unknown.filter((entry) => entry.call).map((entry) => `${entry.written}()`);
    if (names.length > 0)
      return `${parameter.label}: no line sets ${names.join(', ')} yet; it must exist before this line runs.`;
    return calls.length > 0 ? `${parameter.label}: no function is named ${calls.join(', ')}.` : '';
  };
  const hint = document.createElement('span');
  hint.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldHint;
  hint.textContent = parameter.hint;
  solidScriptConfiguratorFormulaButton(parameter, inputs, field.read, scope.formula);
  row.append(caption, inputs, hint);
  return {
    element: row,
    read: field.read,
    warning,
    close: () => lists.forEach((list) => list.close()),
    fillsSet: (extra) => {
      suggest.extra = extra;
      known = solidScriptFieldKnown(scope.names, extra);
    },
    choicesSet: (words) => {
      suggest.words = words.length > 0 ? words : named;
    },
    problem: () => {
      const problem = field.problem();
      for (const input of inputs.querySelectorAll('input[type="text"]'))
        input.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.invalid, problem !== '');
      return problem;
    },
  };
}

/**
 * Tells whether a field can be built from formula blocks: every field that
 * reads [names] and [=formulas], an Anchor and a texture too.
 *
 * @param parameter Field.
 * @returns True when it can.
 */
export function solidScriptConfiguratorFormulaCapable(parameter: SolidScriptCommandParameter): boolean {
  return !solidScriptFieldAsTyped(parameter);
}

/**
 * Adds the … button that opens the formula window of a field, which writes the
 * text it builds into the field.
 *
 * @param parameter Field.
 * @param inputs Container of the field's inputs.
 * @param read Reads the field text.
 * @param open Opens the formula window, or undefined for no button.
 */
function solidScriptConfiguratorFormulaButton(
  parameter: SolidScriptCommandParameter,
  inputs: HTMLElement,
  read: () => string,
  open: SolidScriptConfiguratorScope['formula'],
): void {
  const input = inputs.querySelector<HTMLInputElement>('input[type="text"]');
  if (!open || !input || !solidScriptConfiguratorFormulaCapable(parameter)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = SOLID_SCRIPT_EDITOR_CLASSES.fieldFormula;
  button.textContent = '…';
  button.setAttribute('aria-label', `Build ${parameter.label} from blocks`);
  button.title = 'Build this value from blocks, such as In Box or Compare, in a bigger window.';
  button.addEventListener('click', () =>
    open(parameter, read(), (text) => {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }),
  );
  inputs.append(button);
}

/**
 * Fills a field with the inputs its type needs.
 *
 * @param parameter Parameter.
 * @param value Stored value.
 * @param inputs Container.
 * @returns Reader and check.
 */
function solidScriptConfiguratorInputs(
  parameter: SolidScriptCommandParameter,
  value: string,
  inputs: HTMLElement,
  names: readonly SolidScriptName[],
): SolidScriptConfiguratorFieldReader {
  const switched = parameter.type === 'boolean' ? solidScriptFieldBoolean(value) : value;
  const shown = typeof switched === 'boolean' ? (switched ? 'Yes' : 'No') : value;
  const input = solidScriptConfiguratorInput(shown, parameter.label);
  const placeholder = solidScriptParameterPlaceholder(parameter);
  if (placeholder !== '') input.placeholder = placeholder;
  if (parameter.texture === true)
    return solidScriptConfiguratorTexture(input, parameter, inputs, solidScriptConfiguratorResources(names, 'Texture'));
  if (parameter.curve !== undefined)
    return solidScriptConfiguratorCurve(
      input,
      parameter,
      inputs,
      () => solidScriptConfiguratorProblem(parameter, input.value),
      solidScriptConfiguratorResources(names, 'Curve'),
    );
  if (parameter.color === true) solidScriptConfiguratorColorAttach(input, inputs);
  else inputs.append(input);
  const read = () =>
    parameter.verbatim === true || parameter.spaces === true ? input.value : solidScriptFieldTrim(input.value);
  return { read, problem: () => solidScriptConfiguratorProblem(parameter, input.value) };
}

/**
 * Builds a texture field: the shared texture picker, or typing for a variable
 * or formula. It opens typed when the text uses [ ], and turns typed when the
 * formula window writes such text into it.
 *
 * @param input Text input with the stored text.
 * @param parameter Parameter.
 * @param inputs Container.
 * @returns Reader and check.
 */
function solidScriptConfiguratorTexture(
  input: HTMLInputElement,
  parameter: SolidScriptCommandParameter,
  inputs: HTMLElement,
  resources: readonly string[],
): SolidScriptConfiguratorFieldReader {
  const field = new SolidScriptConfiguratorTextureField(input, parameter.label, inputs, resources);
  return {
    read: () => (field.picking ? field.select.read() : input.value.trim()),
    problem: () => (field.picking ? '' : solidScriptConfiguratorProblem(parameter, input.value)),
  };
}

/** A texture field switching between the texture picker and typing. */
class SolidScriptConfiguratorTextureField {
  /** The shared texture picker. */
  readonly select: ReturnType<typeof textureSelectCreate>;
  /** True while the picker shows, false while the text input does. */
  picking: boolean;
  /** Pick and Type buttons. */
  private readonly modes: HTMLButtonElement[];

  /**
   * Builds the field into its container.
   *
   * @param input Text input with the stored text.
   * @param label Caption of the field.
   * @param inputs Container.
   */
  constructor(
    private readonly input: HTMLInputElement,
    label: string,
    private readonly inputs: HTMLElement,
    private readonly resources: readonly string[],
  ) {
    this.select = textureSelectCreate(
      label,
      () => this.changed(),
      resources.map((name) => ({ value: `[${name}]`, label: `[${name}]` })),
    );
    this.select.element.classList.add(SOLID_SCRIPT_EDITOR_CLASSES.input);
    this.picking = this.pickable(input.value);
    this.modes = (['Pick', 'Type'] as const).map((mode) => this.modeButton(mode));
    this.select.write(this.picking ? input.value.trim() : '');
    this.show();
    input.addEventListener('input', () => this.follow());
    inputs.append(...this.modes, this.select.element, input);
  }

  /**
   * Creates the button that switches to picking or typing.
   *
   * @param mode Pick or Type.
   * @returns Button.
   */
  private modeButton(mode: 'Pick' | 'Type'): HTMLButtonElement {
    const tip = mode === 'Pick' ? 'Pick a texture from the library' : 'Type a texture name, variable or formula';
    const button = solidScriptEditorToolButton(mode, mode.toLowerCase(), tip, () => this.switch(mode === 'Pick'));
    button.setAttribute('aria-label', `${mode} Texture`);
    return button;
  }

  /**
   * Switches between picking and typing, carrying the texture over.
   *
   * @param picking True to pick.
   */
  private switch(picking: boolean): void {
    if (picking === this.picking) return;
    if (this.picking) this.input.value = this.select.read();
    else if (this.pickable(this.input.value)) this.select.write(this.input.value.trim());
    this.picking = picking;
    this.show();
    this.changed();
  }

  /**
   * Follows text written into the input while picking, such as by the formula
   * window.
   */
  private follow(): void {
    if (!this.picking) return;
    this.picking = this.pickable(this.input.value);
    if (this.picking) this.select.write(this.input.value.trim());
    this.show();
  }

  /**
   * Tells whether the picker can show text: a library texture or a texture
   * resource of the script.
   *
   * @param text Field text.
   * @returns True when it can.
   */
  private pickable(text: string): boolean {
    return !text.includes('[') || this.resources.some((name) => `[${name}]` === text.trim());
  }

  /** Shows the picker or the input, and which button is down. */
  private show(): void {
    this.select.element.hidden = !this.picking;
    this.input.hidden = this.picking;
    this.modes.forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0) === this.picking)));
  }

  /** Tells the field it changed. */
  private changed(): void {
    this.inputs.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/**
 * Builds one text input.
 *
 * @param value Text.
 * @param label Accessible name.
 * @returns Input.
 */
export function solidScriptConfiguratorInput(value: string, label: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = SOLID_SCRIPT_EDITOR_CLASSES.input;
  input.value = value;
  input.spellcheck = false;
  input.setAttribute('aria-label', label);
  return input;
}

/**
 * Checks the typed name of a field that names a variable or what a line sets: a
 * stray dot, a name that is no name, or a target Set cannot change. Other
 * fields have no such problem.
 *
 * @param parameter Parameter.
 * @param text Typed text, trimmed.
 * @returns Problem, or an empty string.
 */
function solidScriptConfiguratorNameProblem(parameter: SolidScriptCommandParameter, text: string): string {
  if (parameter.type !== 'name' && parameter.type !== 'target') return '';
  if (!solidScriptFieldAsTyped(parameter) && text.includes('[')) return '';
  const dotted = solidScriptNameDotProblem(text, 'set');
  if (dotted) return `${parameter.label}: ${dotted}.`;
  if (parameter.type === 'name' && !SOLID_SCRIPT_CONFIGURATOR_NAME.test(text))
    return `${parameter.label} must start with a letter and use only letters, digits and _.`;
  if (
    parameter.type === 'target' &&
    !SOLID_SCRIPT_CONFIGURATOR_TARGET.test(text) &&
    !solidScriptNameIsDataWrite(text) &&
    !solidScriptNameIsUvWrite(text) &&
    !solidScriptNameIsPositionWrite(text)
  )
    return `${parameter.label} must be a name such as width, an item such as points(0), points() to add one, Vertex.Position, Face.UVs, or a value under .Data such as face.data.height.`;
  return '';
}

/**
 * Tells whether a field offers suggestions as it is typed: every field that
 * reads [names] and [=formulas], and a field used as typed that offers name
 * groups, such as Set's Variable or Output's Of, or words, such as a Text
 * block.
 *
 * @param parameter Field.
 * @returns True when it offers them.
 */
export function solidScriptConfiguratorSuggests(parameter: SolidScriptCommandParameter): boolean {
  const offers = solidScriptConfiguratorNameGroups(parameter) !== undefined || (parameter.words?.length ?? 0) > 0;
  return !solidScriptFieldAsTyped(parameter) || offers;
}

/**
 * Checks a typed value.
 *
 * @param parameter Parameter.
 * @param value Typed text.
 * @returns Problem, or an empty string.
 */
export function solidScriptConfiguratorProblem(parameter: SolidScriptCommandParameter, value: string): string {
  const text = solidScriptParameterValueEffective(value, parameter.default).trim();
  if (text === '' && (parameter.optional || parameter.type === 'text')) return '';
  const named = solidScriptConfiguratorNameProblem(parameter, text);
  if (named) return named;
  if (parameter.type !== 'text' && text === '') return `${parameter.label} needs a value.`;
  if (parameter.anchor && !text.includes('[')) {
    const read = solidScriptAnchorRead(text, parameter.anchor);
    return typeof read === 'string' ? `${parameter.label} ${read}.` : '';
  }
  if (solidScriptFieldAsTyped(parameter) && (parameter.type === 'name' || parameter.type === 'text')) return '';
  const size = solidScriptConfiguratorVectorSize(parameter);
  const count = solidScriptFieldSplit(text, ',').length;
  if (size > 0 && count !== 1 && count !== size)
    return `${parameter.label} needs ${size} values separated by commas, or one vector such as [$Box.Size].`;
  const problem = solidScriptFieldCheck(text, parameter.type === 'condition');
  return problem === '' ? '' : `${parameter.label}: ${problem}.`;
}
