import type { SolidScriptCommand, SolidScriptCommandValues } from '@/solid_script/commands/solid_script_command.js';
import { solidScriptParameterApplies } from '@/solid_script/commands/solid_script_command_parameters.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import {
  solidScriptConfiguratorFieldBuild,
  type SolidScriptConfiguratorField,
} from './solid_script_configurator_fields.js';
import { type SolidScriptName } from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptInputRead } from '@/solid_script/language/solid_script_input.js';
import { SolidScriptDialog } from './solid_script_dialog.js';
import { solidScriptScrollerWrap } from './solid_script_editor_scroll.js';

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
   * @param history Undoes (false) or redoes (true) a step of the script's own
   *   history for Ctrl+Z and Ctrl+Y outside a text field, or null.
   */
  constructor(
    host: HTMLElement,
    private readonly command: SolidScriptCommand,
    values: SolidScriptCommandValues,
    private readonly apply: (values: Record<string, string>) => void,
    names: readonly SolidScriptName[] = [],
    private readonly cancelled: (() => void) | null = null,
    history: ((redo: boolean) => void) | null = null,
  ) {
    super(host, command.label, 'OK');
    this.root.dataset['solidScriptConfigurator'] = command.id;
    // Undo keys belong to the script, never to the level behind the window;
    // inside a text field they undo typing.
    this.root.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || (key !== 'z' && key !== 'y')) return;
      event.stopPropagation();
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      history?.(key === 'y' || event.shiftKey);
    });
    this.content.append(this.note(command.description));
    // Many fields scroll inside the window, so it never grows past the page.
    const list = document.createElement('div');
    Object.assign(list.style, { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', paddingRight: '4px' });
    this.content.append(solidScriptScrollerWrap(list, '0 1 auto', 0));
    for (const parameter of command.parameters) {
      const field = solidScriptConfiguratorFieldBuild(
        parameter,
        values[parameter.key] ?? parameter.default,
        () => this.refresh(),
        { names, extra: command.fills },
      );
      this.fields.set(parameter.key, field);
      list.append(field.element);
    }
    this.preview.className = SOLID_SCRIPT_EDITOR_CLASSES.preview;
    this.preview.setAttribute('aria-label', 'Line');
    Object.assign(this.problem.style, { color: '#e5484d', minHeight: '16px', marginBottom: '8px' });
    this.content.append(this.preview, this.problem, this.buttonRow());
    this.refresh();
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
    this.apply(this.values());
    return true;
  }

  /** Leaves the line unchanged. */
  protected cancel(): void {
    this.cancelled?.();
  }

  /** Closes the suggestion lists with the window. */
  protected override onAfterHide(): void {
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
   * Lists the fields the current values make use of, and hides the rest.
   *
   * @returns Visible fields, in command order.
   */
  private visibleFields(): SolidScriptConfiguratorField[] {
    const values = this.values();
    const shown: SolidScriptConfiguratorField[] = [];
    for (const parameter of this.command.parameters) {
      const field = this.fields.get(parameter.key);
      if (!field) continue;
      const applies = solidScriptParameterApplies(parameter, values, this.command.parameters);
      field.element.hidden = !applies;
      if (applies) shown.push(field);
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
   * Checks the values together where the command reads them before running,
   * such as the type and limits of an Input line.
   *
   * @returns Problem, or an empty string.
   */
  private commandProblem(): string {
    if (this.command.id !== 'input') return '';
    try {
      solidScriptInputRead(this.values());
      return '';
    } catch (error) {
      return error instanceof Error ? `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.` : '';
    }
  }
}
