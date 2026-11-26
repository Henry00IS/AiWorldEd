import {
  solidScriptCurveFromStored,
  solidScriptCurveFromText,
} from '@/solid_script/language/solid_script_curve_read.js';
import { curveFromPolyline, type Curve } from '@/curve/model/curve_model.js';
import { CurveField } from '@/curve/ui/curve_field.js';
import { MODIFIER_STACK_CURVE_MARKER_STYLE } from '@/modifier/stack/ui/modifier_stack_curve_row.js';
import type {
  SolidScriptCommandCurve,
  SolidScriptCommandParameter,
} from '@/solid_script/commands/solid_script_command.js';
import { solidScriptFieldEscapes, solidScriptFieldUnescape } from '@/solid_script/language/solid_script_field.js';
import { solidScriptEditorToolButton } from './solid_script_editor_icons.js';
import { SOLID_SCRIPT_EDITOR_CLASSES } from './solid_script_editor_css.js';
import { SolidScriptConfiguratorCurves } from './solid_script_configurator_curves.js';

/** Value of the picker choice that makes a new curve resource. */
const SOLID_SCRIPT_CURVE_NEW = '+';

/**
 * Tells whether stored text contains an unescaped [variable] or [=formula].
 *
 * @param text Stored field text.
 * @returns True when it holds a reference or formula.
 */
function solidScriptCurveHasBracket(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    if (solidScriptFieldEscapes(text, index)) index++;
    else if (text[index] === '[') return true;
  }
  return false;
}

/**
 * Builds a curve field: a picker of the script's curve resources with the
 * shared curve editor strip below, or typing for a variable or formula. A curve
 * edited in the strip is kept in the resource the field names, or in a new
 * resource named after the field, so the field never holds curve data.
 *
 * @param input Text input holding the stored text.
 * @param parameter Parameter with curve settings.
 * @param inputs Container element.
 * @param problem Checks typed text when not picking.
 * @param curves Curve resources of the script the window works on.
 * @returns Reader and validation check.
 */
export function solidScriptConfiguratorCurve(
  input: HTMLInputElement,
  parameter: SolidScriptCommandParameter,
  inputs: HTMLElement,
  problem: () => string,
  curves: SolidScriptConfiguratorCurves = new SolidScriptConfiguratorCurves([]),
): { read: () => string; problem: () => string } {
  const field = new SolidScriptConfiguratorCurveField(input, parameter.label, parameter.curve!, inputs, curves);
  return {
    read: () => input.value.trim(),
    problem: () => {
      if (field.picking || curves.curve(input.value) !== null) return '';
      return solidScriptCurveFromText(solidScriptFieldUnescape(input.value)) ? '' : problem();
    },
  };
}

/** Flat 1.0 curve shown when neither stored text nor fallback decodes. */
function solidScriptCurveDefault(): Curve {
  return curveFromPolyline([
    [0, 1],
    [1, 1],
  ]);
}

/** A curve field switching between picking a curve resource and typing. */
class SolidScriptConfiguratorCurveField {
  /** True while the picker and strip show, false while the text input does. */
  picking: boolean;
  private readonly curveField: CurveField;
  private readonly host = document.createElement('div');
  private readonly modes: HTMLButtonElement[];
  /** Picks a curve resource of the script, or makes a new one. */
  private readonly resource = document.createElement('select');
  /** Field text that names no resource, kept while a resource is picked. */
  private own: string;

  /**
   * Builds the curve field into its container.
   *
   * @param input Text input with the stored text.
   * @param label Caption of the field.
   * @param curve Curve editor settings.
   * @param inputs Container.
   * @param curves Curve resources of the script.
   */
  constructor(
    private readonly input: HTMLInputElement,
    private readonly label: string,
    private readonly curve: SolidScriptCommandCurve,
    private readonly inputs: HTMLElement,
    private readonly curves: SolidScriptConfiguratorCurves,
  ) {
    this.picking = this.named(input.value) || !solidScriptCurveHasBracket(input.value);
    this.own = this.named(input.value) ? '' : input.value;
    this.resource.setAttribute('aria-label', `${label} resource`);
    this.resource.className = SOLID_SCRIPT_EDITOR_CLASSES.input;
    this.resource.addEventListener('change', () => this.chosen());
    this.curveField = this.stripBuild();
    this.modes = (['Pick', 'Type'] as const).map((mode) => this.modeButton(mode));
    this.resourceFill();
    this.writePreview();
    this.show();
    input.addEventListener('input', () => this.follow());
    inputs.append(...this.modes, this.resource, this.host, input);
  }

  /**
   * Builds the curve strip, whose edits go into a resource.
   *
   * @returns Strip.
   */
  private stripBuild(): CurveField {
    const strip = new CurveField({
      label: this.label,
      presets: this.curve.presets,
      fileName: this.label,
      onPreview: () => undefined,
      onCommit: (next) => this.write(this.curves.write(this.input.value, this.label, next)),
      ...(this.curve.markers ? { markers: MODIFIER_STACK_CURVE_MARKER_STYLE } : {}),
    });
    this.host.style.flex = '1 1 0';
    this.host.style.minWidth = '0';
    this.host.append(strip.getElement());
    return strip;
  }

  /** Fills the picker: no resource, each curve resource, then New Curve. */
  private resourceFill(): void {
    const names = this.curves.names().map((name) => new Option(`[${name}]`, `[${name}]`));
    this.resource.replaceChildren(
      new Option('No Resource', ''),
      ...names,
      new Option('New Curve', SOLID_SCRIPT_CURVE_NEW),
    );
    this.resource.value = this.named(this.input.value) ? this.input.value.trim() : '';
  }

  /** Follows the picker: a resource, the text before, or a new curve. */
  private chosen(): void {
    const value = this.resource.value;
    if (value === SOLID_SCRIPT_CURVE_NEW) {
      const curve = this.previewCurve();
      return this.write(this.curves.write('', this.label, curve));
    }
    this.write(value === '' ? this.own : value);
  }

  /**
   * Writes field text, then redraws the picker and strip.
   *
   * @param text Field text.
   */
  private write(text: string): void {
    this.input.value = text;
    if (!this.named(text)) this.own = text;
    this.resourceFill();
    this.writePreview();
    this.changed();
  }

  /**
   * Tells whether field text names one of the curve resources.
   *
   * @param text Field text.
   * @returns True when it does.
   */
  private named(text: string): boolean {
    const trimmed = text.trim();
    return this.curves.names().some((name) => `[${name}]`.toLowerCase() === trimmed.toLowerCase());
  }

  /**
   * Creates the button that switches to picking or typing.
   *
   * @param mode Pick or Type.
   * @returns Button.
   */
  private modeButton(mode: 'Pick' | 'Type'): HTMLButtonElement {
    const tip =
      mode === 'Pick'
        ? 'Pick a curve of the script, or edit the curve to keep it with the script'
        : 'Type a Curve input variable, a formula, a preset name or points';
    const button = solidScriptEditorToolButton(mode, mode.toLowerCase(), tip, () => this.switch(mode === 'Pick'));
    button.setAttribute('aria-label', `${mode} ${this.label}`);
    return button;
  }

  /**
   * Switches between picking and typing.
   *
   * @param picking True to pick.
   */
  private switch(picking: boolean): void {
    if (picking === this.picking) return;
    this.picking = picking;
    this.resourceFill();
    this.writePreview();
    this.show();
    this.changed();
  }

  /**
   * Follows text written into the input, such as by the formula window or by
   * typing.
   */
  private follow(): void {
    if (!this.named(this.input.value)) this.own = this.input.value;
    if (!this.picking) return;
    this.picking = this.named(this.input.value) || !solidScriptCurveHasBracket(this.input.value);
    this.resourceFill();
    this.writePreview();
    this.show();
  }

  /**
   * Reads the curve the field shows: its resource, its typed curve, the field's
   * fallback, or a flat line.
   *
   * @returns Curve.
   */
  private previewCurve(): Curve {
    return (
      this.curves.curve(this.input.value) ??
      solidScriptCurveFromText(solidScriptFieldUnescape(this.input.value)) ??
      solidScriptCurveFromStored(this.curve.fallback) ??
      solidScriptCurveDefault()
    );
  }

  /** Updates the curve strip from the field. */
  private writePreview(): void {
    this.curveField.setCurve(this.previewCurve());
  }

  /** Shows the picker and strip or the text input, and updates the toggles. */
  private show(): void {
    this.resource.hidden = !this.picking;
    this.host.hidden = !this.picking;
    this.input.hidden = this.picking;
    this.modes.forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0) === this.picking)));
  }

  /** Tells the field it changed. */
  private changed(): void {
    this.inputs.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
