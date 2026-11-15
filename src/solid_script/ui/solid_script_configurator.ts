import type { SolidScriptCommand, SolidScriptCommandValues } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import {
  solidScriptConfiguratorFieldBuild,
  type SolidScriptConfiguratorField,
} from './solid_script_configurator_fields.js';
import { SolidScriptDialog } from './solid_script_dialog.js';

/**
 * The configurator of one command line: a labelled field per value with a hint
 * on hover, and the line of code it writes, so nobody has to know the syntax.
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
   * @param inserting True for a new line (Insert), false to edit a line
   *   (Apply).
   */
  constructor(
    host: HTMLElement,
    private readonly command: SolidScriptCommand,
    values: SolidScriptCommandValues,
    private readonly apply: (values: Record<string, string>) => void,
    inserting: boolean,
  ) {
    super(host, command.label, inserting ? 'Insert' : 'Apply');
    this.root.dataset['solidScriptConfigurator'] = command.id;
    this.root.append(this.note(command.description));
    for (const parameter of command.parameters) {
      const field = solidScriptConfiguratorFieldBuild(parameter, values[parameter.key] ?? parameter.default, () =>
        this.refresh(),
      );
      this.fields.set(parameter.key, field);
      this.root.append(field.element);
    }
    this.preview.className = SOLID_SCRIPT_EDITOR_CLASSES.preview;
    this.preview.setAttribute('aria-label', 'Code');
    Object.assign(this.problem.style, { color: '#e5484d', minHeight: '16px', marginBottom: '8px' });
    this.root.append(this.preview, this.problem, this.buttonRow());
    this.refresh();
  }

  /** Focuses the first field. */
  protected override onAfterShow(): void {
    const first = this.root.querySelector<HTMLInputElement>('input');
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
  protected cancel(): void {}

  /**
   * Reads every field.
   *
   * @returns Values by parameter key.
   */
  private values(): Record<string, string> {
    return Object.fromEntries([...this.fields].map(([key, field]) => [key, field.read()]));
  }

  /** Shows the code the values write and whether they can be used. */
  private refresh(): void {
    const problem = [...this.fields.values()].map((field) => field.problem()).find((text) => text !== '') ?? '';
    this.preview.textContent = this.command.code(this.values());
    this.problem.textContent = problem;
    this.confirmEnable(problem === '');
  }
}
