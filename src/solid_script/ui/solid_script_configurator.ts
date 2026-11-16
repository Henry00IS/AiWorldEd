import type { SolidScriptCommand, SolidScriptCommandValues } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import {
  solidScriptConfiguratorFieldBuild,
  type SolidScriptConfiguratorField,
} from './solid_script_configurator_fields.js';
import {
  SOLID_SCRIPT_NAMES_COMMAND,
  type SolidScriptName,
} from '@/solid_script/document/solid_script_document_names.js';
import { solidScriptInputRead } from '@/solid_script/language/solid_script_input.js';
import { SolidScriptDialog } from './solid_script_dialog.js';
import { SolidScriptConfiguratorBrowser } from './solid_script_configurator_browser.js';
import type { SolidScriptSuggestionScope } from './solid_script_suggestions.js';
import { solidScriptEditorLinked, type SolidScriptEditorLinkOpen } from './solid_script_editor_links.js';

/**
 * The configurator of one command line: a window titled with the command, a
 * labelled field per value with a hint on hover, the line as the script listing
 * will show it, and OK and Cancel. The ? in the title bar shows the command's
 * manual, the V opens the value browser for the field edited last.
 */
export class SolidScriptConfigurator extends SolidScriptDialog {
  private readonly fields = new Map<string, SolidScriptConfiguratorField>();
  private readonly preview = document.createElement('div');
  private readonly problem = document.createElement('div');
  private readonly manual = document.createElement('div');
  private readonly browser = new SolidScriptConfiguratorBrowser(() => this.fieldLast());
  private last: HTMLInputElement | null = null;

  /**
   * Builds the configurator.
   *
   * @param host Element the dialog mounts in.
   * @param command Command of the line.
   * @param values Stored values.
   * @param apply Stores the configured values.
   * @param names Names the script defines, for suggestions and checks.
   * @param open Opens a command the manual mentions in the palette, or null.
   * @param cancelled Runs when the window closes without storing, or null.
   */
  constructor(
    host: HTMLElement,
    private readonly command: SolidScriptCommand,
    values: SolidScriptCommandValues,
    private readonly apply: (values: Record<string, string>) => void,
    names: readonly SolidScriptName[] = [],
    private readonly open: SolidScriptEditorLinkOpen | null = null,
    private readonly cancelled: (() => void) | null = null,
  ) {
    super(host, command.label, 'OK');
    this.root.dataset['solidScriptConfigurator'] = command.id;
    const browse = this.titleButton('V', 'Browse Values', () => this.browser.toggle(browse));
    browse.addEventListener('mousedown', (event) => event.preventDefault());
    this.titleButton('?', 'Manual', () => {
      this.manual.hidden = !this.manual.hidden;
    });
    this.content.addEventListener('focusin', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === 'text') this.last = event.target;
    });
    this.manualBuild();
    this.content.append(this.note(command.description), this.manual);
    for (const parameter of command.parameters) {
      const field = solidScriptConfiguratorFieldBuild(
        parameter,
        values[parameter.key] ?? parameter.default,
        () => this.refresh(),
        { names, extra: SOLID_SCRIPT_NAMES_COMMAND[command.id] ?? [] },
      );
      this.fields.set(parameter.key, field);
      this.content.append(field.element);
    }
    this.preview.className = SOLID_SCRIPT_EDITOR_CLASSES.preview;
    this.preview.setAttribute('aria-label', 'Line');
    Object.assign(this.problem.style, { color: '#e5484d', minHeight: '16px', marginBottom: '8px' });
    this.content.append(this.preview, this.problem, this.buttonRow());
    this.refresh();
  }

  /** Fills the manual: what the command does and when it stops the script. */
  private manualBuild(): void {
    this.manual.className = SOLID_SCRIPT_EDITOR_CLASSES.configuratorManual;
    this.manual.setAttribute('aria-label', 'Manual');
    this.manual.hidden = true;
    const text = document.createElement('p');
    solidScriptEditorLinked(text, this.command.manual, this.open, this.command.id);
    this.manual.append(text);
    if (this.command.stops.length === 0) return;
    const caption = document.createElement('p');
    caption.textContent = 'Stops the script when';
    const list = document.createElement('ul');
    for (const stop of this.command.stops) {
      list.append(solidScriptEditorLinked(document.createElement('li'), stop, this.open, this.command.id));
    }
    this.manual.append(caption, list);
  }

  /** Focuses the first field. */
  protected override onAfterShow(): void {
    const first = this.content.querySelector<HTMLInputElement>('input');
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

  /** Closes the value browser and suggestion lists with the window. */
  protected override onAfterHide(): void {
    this.browser.close();
    for (const field of this.fields.values()) field.close();
  }

  /**
   * Finds the field the value browser writes into: the one edited last, or the
   * first that takes values.
   *
   * @returns Input with what it may refer to, or null when no field takes
   *   values.
   */
  private fieldLast(): { input: HTMLInputElement; scope: SolidScriptSuggestionScope } | null {
    const fields = [...this.fields.values()];
    const owner =
      fields.find((field) => this.last !== null && field.texts.includes(this.last)) ??
      fields.find((field) => field.texts.length > 0);
    const input = owner?.texts.includes(this.last as HTMLInputElement) ? this.last : owner?.texts[0];
    return owner && input ? { input, scope: owner.scope } : null;
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
   * Shows the line as listed and whether the values can be used: a mistake in
   * red disables OK, a note on names no line sets yet is shown dimmed.
   */
  private refresh(): void {
    const fields = [...this.fields.values()];
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
