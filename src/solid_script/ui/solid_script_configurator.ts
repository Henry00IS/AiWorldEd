import type { SolidScriptResource } from '@/solid_script/document/solid_script_resource.js';
import type { SolidScriptConfiguratorCurves } from './solid_script_configurator_curves.js';
import { solidScriptEachNote } from '@/solid_script/commands/solid_script_command_each.js';
import type {
  SolidScriptCommand,
  SolidScriptCommandParameter,
  SolidScriptCommandValues,
  SolidScriptCommandWord,
} from '@/solid_script/commands/solid_script_command.js';
import {
  solidScriptCommandValuesStored,
  solidScriptParameterAllowsEmpty,
  solidScriptParameterValueStored,
} from '@/solid_script/commands/solid_script_parameter_default.js';
import {
  solidScriptCommandFieldFills,
  solidScriptParameterEachActive,
  solidScriptParameterEachKind,
} from '@/solid_script/commands/solid_script_command_each.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import {
  solidScriptConfiguratorFieldBuild,
  type SolidScriptConfiguratorField,
  solidScriptConfiguratorResourceWords,
} from './solid_script_configurator_fields.js';
import {
  solidScriptFieldEachFillWarning,
  type SolidScriptName,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptInputRead, type SolidScriptInput } from '@/solid_script/language/solid_script_input.js';
import { solidScriptChoiceWordsForField } from '@/solid_script/language/solid_script_choices.js';
import { solidScriptAnchorAxisWords } from '@/solid_script/language/solid_script_anchor.js';
import { curveEditorCloseIfInside } from '@/curve/ui/curve_editor.js';
import { SolidScriptDialog } from './solid_script_dialog.js';
import { SOLID_SCRIPT_FORMULA_CATEGORIES } from '@/solid_script/commands/solid_script_formula_commands.js';
import type { SolidScriptFormulaContext } from '@/solid_script/commands/solid_script_formula_inputs.js';
import { SolidScriptFormulaWindow, solidScriptFormulaWindowProblem } from './solid_script_formula_window.js';
import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';
import { SolidScriptNormalPickWindow } from './normal_pick/solid_script_normal_pick_window.js';

/**
 * The configurator of one command line: a window titled with the command, a
 * labelled field per value with a hint on hover, the line as the script listing
 * will show it, and OK and Cancel.
 */
export class SolidScriptConfigurator extends SolidScriptDialog {
  private readonly fields = new Map<string, SolidScriptConfiguratorField>();
  private readonly preview = document.createElement('div');
  private readonly problem = document.createElement('div');

  /**
   * Builds the configurator.
   *
   * @param host Element the dialog mounts in.
   * @param command Command of the line.
   * @param values Stored values.
   * @param apply Stores the configured values.
   * @param names Names the script defines, for suggestions and checks.
   * @param cancelled Runs when the window closes without storing, or null.
   * @param inputs Input lines whose words choice fields offer.
   * @param fills Names every field fills in besides the command's own, such as
   *   $Face for the blocks of a Where formula.
   * @param parent Dialog this one opens over, such as the formula window, or
   *   null.
   * @param curves Curve resources of the script, which curve fields pick and
   *   keep edited curves in, or null for none.
   */
  constructor(
    host: HTMLElement,
    private readonly command: SolidScriptCommand,
    values: SolidScriptCommandValues,
    private readonly apply: (values: Record<string, string>, resources: readonly SolidScriptResource[] | null) => void,
    private readonly names: readonly SolidScriptName[] = [],
    private readonly cancelled: (() => void) | null = null,
    private readonly inputs: readonly SolidScriptInput[] = [],
    private readonly fills: readonly string[] = [],
    parent: SolidScriptDialog | null = null,
    private readonly curves: SolidScriptConfiguratorCurves | null = null,
  ) {
    super(host, command.label, 'OK', parent);
    this.root.dataset['solidScriptConfigurator'] = command.id;
    this.content.append(this.note(command.description));
    const each = solidScriptEachNote(command.parameters);
    if (each) {
      const note = this.note(each);
      note.dataset['solidScriptEachNote'] = '';
      Object.assign(note.style, { margin: '0 0 12px', fontSize: '12px' });
      this.content.append(note);
    }
    this.content.append(this.fieldsBuild(values));
    this.preview.className = SOLID_SCRIPT_EDITOR_CLASSES.preview;
    this.preview.setAttribute('aria-label', 'Line');
    Object.assign(this.problem.style, { color: '#e5484d', minHeight: '16px', marginBottom: '8px' });
    this.content.append(this.preview, this.problem, this.buttonRow());
    this.refresh();
  }

  /**
   * Builds a field per input in a list that scrolls inside the window, so many
   * fields never grow it past the page.
   *
   * @param values Stored values.
   * @returns Scrolling list.
   */
  private fieldsBuild(values: SolidScriptCommandValues): HTMLElement {
    const list = document.createElement('div');
    Object.assign(list.style, { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: '4px' });
    for (const parameter of this.command.parameters) {
      const field = this.fieldBuild(parameter, values);
      this.fields.set(parameter.key, field);
      list.append(field.element);
    }
    return solidScriptScrollerWrap(list, '0 1 auto', 0);
  }

  /**
   * Builds the field of one input, with a … button that builds a formula from
   * blocks unless this is itself a formula block.
   *
   * @param parameter Input.
   * @param values Stored values.
   * @returns Field.
   */
  private fieldBuild(
    parameter: SolidScriptCommandParameter,
    values: SolidScriptCommandValues,
  ): SolidScriptConfiguratorField {
    const command = this.command;
    const stored = values[parameter.key] ?? (solidScriptParameterAllowsEmpty(parameter) ? '' : parameter.default);
    return solidScriptConfiguratorFieldBuild(parameter, stored, () => this.refresh(), {
      names: this.names,
      extra: this.fillsOf(parameter, values),
      eachFillWarning: (text) => solidScriptFieldEachFillWarning(command, parameter, this.values(), text),
      values: () => this.values(),
      inputs: this.inputs,
      ...(SOLID_SCRIPT_FORMULA_CATEGORIES.includes(command.category)
        ? {}
        : { formula: (field, text, write) => this.formulaOpen(field, text, write) }),
      normal: (write) => new SolidScriptNormalPickWindow({ host: this.host, parent: this, write }).show(),
      ...(this.curves ? { curves: this.curves } : {}),
    });
  }

  /** Focuses the first field. */
  protected override onAfterShow(): void {
    const first = this.visibleFields()
      .map((field) => field.element.querySelector<HTMLInputElement>('input'))
      .find((input) => input !== null);
    first?.focus();
    if (first?.type === 'text') first.select();
  }

  /**
   * Stores the values.
   *
   * @returns True to close.
   */
  protected confirm(): boolean {
    this.apply(solidScriptCommandValuesStored(this.command, this.values()), this.curves?.changed() ?? null);
    return true;
  }

  /** Leaves the line unchanged. */
  protected cancel(): void {
    this.cancelled?.();
  }

  /** Closes the suggestion lists, with the window or under a dialog over it. */
  protected override popupsClose(): void {
    curveEditorCloseIfInside(this.root);
    for (const field of this.fields.values()) field.close();
  }

  /**
   * Reads every field.
   *
   * @returns Values by parameter key.
   */
  private values(): Record<string, string> {
    return Object.fromEntries([...this.fields].map(([key, field]) => [key, field.read()]));
  }

  /**
   * Lists the fields of the command; every field is always shown.
   *
   * @returns Visible fields, in command order.
   */
  private visibleFields(): SolidScriptConfiguratorField[] {
    const values = this.values();
    const shown: SolidScriptConfiguratorField[] = [];
    for (const parameter of this.command.parameters) {
      const field = this.fields.get(parameter.key);
      if (!field) continue;
      const active = solidScriptParameterEachActive(parameter, values) !== undefined;
      field.element.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.fieldEach, active);
      const icon = field.element.querySelector<HTMLElement>(`.${SOLID_SCRIPT_EDITOR_CLASSES.fieldEachIcon}`);
      if (icon) icon.hidden = !active;
      field.fillsSet(this.fillsOf(parameter, values));
      if (!parameter.writes) field.choicesSet(this.choicesOf(parameter, values, field.read()));
      shown.push(field);
    }
    return shown;
  }

  /**
   * Shows the line as listed and whether the values can be used: a mistake in
   * red disables OK, a note on names no line sets yet is shown dimmed.
   */
  private refresh(): void {
    const fields = this.visibleFields();
    const problem = fields.map((field) => field.problem()).find((text) => text !== '') || this.commandProblem();
    const warning = fields.map((field) => field.warning()).find((text) => text !== '') ?? '';
    this.preview.textContent = this.command.listingText(this.values());
    this.problem.textContent = problem || warning;
    this.problem.classList.toggle(SOLID_SCRIPT_EDITOR_CLASSES.fieldWarning, problem === '' && warning !== '');
    this.confirmEnable(problem === '');
  }

  /**
   * Lists the names a field fills in: the command's own and the window's.
   *
   * @param parameter Field.
   * @param values Current values of the line.
   * @returns Names.
   */
  private fillsOf(parameter: SolidScriptCommandParameter, values: SolidScriptCommandValues): string[] {
    return [...solidScriptCommandFieldFills(this.command, parameter, values), ...this.fills];
  }

  /**
   * Opens the formula window of a field over this window, once its formula
   * reads; a broken one must be fixed first. An empty field opens with its
   * declared default as blocks; only OK writes it, and a default left as it is
   * keeps the field empty.
   *
   * @param parameter Field.
   * @param typed Field text.
   * @param write Writes the built text into the field.
   */
  private formulaOpen(parameter: SolidScriptCommandParameter, typed: string, write: (text: string) => void): void {
    const stored = typed.trim() === '' ? parameter.default : typed;
    const values = this.values();
    const problem = solidScriptFormulaWindowProblem(parameter.type, stored);
    if (problem) {
      this.problem.textContent = problem;
      this.problem.classList.remove(SOLID_SCRIPT_EDITOR_CLASSES.fieldWarning);
      return;
    }
    new SolidScriptFormulaWindow({
      host: this.host,
      parent: this,
      label: parameter.label,
      kind: parameter.type,
      stored,
      context: this.formulaContext(parameter, values, stored),
      names: this.names,
      fills: this.fillsOf(parameter, values),
      inputs: this.inputs,
      ...(this.curves ? { curves: this.curves } : {}),
      apply: (text) => write(solidScriptParameterValueStored(text, parameter.default)),
    }).show();
  }

  /**
   * Tells where a field's formula is used: the element it is worked out for,
   * the words a choice field takes, which Text blocks offer: for an Anchor the
   * word of each axis, as its List holds a Text block per axis; and the
   * Functions of the script, which have blocks too.
   *
   * @param parameter Field.
   * @param values Values of the line.
   * @param stored Field text.
   * @returns Context.
   */
  private formulaContext(
    parameter: SolidScriptCommandParameter,
    values: SolidScriptCommandValues,
    stored: string,
  ): SolidScriptFormulaContext {
    const each = solidScriptParameterEachKind(parameter, values);
    const words = parameter.anchor
      ? solidScriptAnchorAxisWords(parameter.anchor)
      : parameter.writes
        ? []
        : solidScriptChoiceWordsForField(parameter, values, stored, this.inputs);
    const functions = this.names.filter((name) => name.category === 'Functions');
    return {
      ...(each ? { each } : {}),
      ...(words.length > 0 ? { words } : {}),
      ...(functions.length ? { functions } : {}),
    };
  }

  /**
   * Lists the words a field offers for the current values: the resources of an
   * Input's type for its Default, else the declared choices.
   *
   * @param parameter Field.
   * @param values Current values.
   * @param text Field text.
   * @returns Words.
   */
  private choicesOf(
    parameter: SolidScriptCommandParameter,
    values: Readonly<Record<string, string>>,
    text: string,
  ): readonly SolidScriptCommandWord[] {
    const resources =
      this.command.id === 'input' ? solidScriptConfiguratorResourceWords(parameter, values, this.names) : [];
    return resources.length > 0 ? resources : solidScriptChoiceWordsForField(parameter, values, text, this.inputs);
  }

  /**
   * Checks the values together where the command reads them before running,
   * such as the type and limits of an Input line.
   *
   * @returns Problem, or an empty string.
   */
  private commandProblem(): string {
    if (this.command.check) return this.command.check(this.values());
    if (this.command.id !== 'input') return '';
    try {
      solidScriptInputRead(this.values());
      return '';
    } catch (error) {
      return error instanceof Error ? `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.` : '';
    }
  }
}
