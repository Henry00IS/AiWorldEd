import type { SolidScriptCommand, SolidScriptCommandValues } from '@/solid_script/commands/solid_script_command.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import {
  solidScriptConfiguratorFieldBuild,
  type SolidScriptConfiguratorField,
} from './solid_script_configurator_fields.js';
import { SolidScriptDialog } from './solid_script_dialog.js';

/**
 * The configurator of one command line: a window titled with the command, a
 * labelled field per value with a hint on hover, the line as the script listing
 * will show it, and OK and Cancel. The ? in the title bar shows the command's
 * manual.
 */
export class SolidScriptConfigurator extends SolidScriptDialog {
  private readonly fields = new Map<string, SolidScriptConfiguratorField>();
  private readonly preview = document.createElement('div');
  private readonly problem = document.createElement('div');
  private readonly manual = document.createElement('div');

  /**
   * Builds the configurator.
   *
   * @param host Element the dialog mounts in.
   * @param command Command of the line.
   * @param values Stored values.
   * @param apply Stores the configured values.
   */
  constructor(
    host: HTMLElement,
    private readonly command: SolidScriptCommand,
    values: SolidScriptCommandValues,
    private readonly apply: (values: Record<string, string>) => void,
  ) {
    super(host, command.label, 'OK');
    this.root.dataset['solidScriptConfigurator'] = command.id;
    this.titleButton('?', 'Manual', () => {
      this.manual.hidden = !this.manual.hidden;
    });
    this.manualBuild();
    this.content.append(this.note(command.description), this.manual);
    for (const parameter of command.parameters) {
      const field = solidScriptConfiguratorFieldBuild(parameter, values[parameter.key] ?? parameter.default, () =>
        this.refresh(),
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
    text.textContent = this.command.manual;
    this.manual.append(text);
    if (this.command.stops.length === 0) return;
    const caption = document.createElement('p');
    caption.textContent = 'Stops the script when';
    const list = document.createElement('ul');
    for (const stop of this.command.stops) {
      const item = document.createElement('li');
      item.textContent = stop;
      list.append(item);
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
  protected cancel(): void {}

  /**
   * Reads every field.
   *
   * @returns Values by parameter key.
   */
  private values(): Record<string, string> {
    return Object.fromEntries([...this.fields].map(([key, field]) => [key, field.read()]));
  }

  /** Shows the line as listed and whether the values can be used. */
  private refresh(): void {
    const problem = [...this.fields.values()].map((field) => field.problem()).find((text) => text !== '') ?? '';
    this.preview.textContent = this.command.listingText(this.values());
    this.problem.textContent = problem;
    this.confirmEnable(problem === '');
  }
}
