import { curveEncode } from '@/curve/model/curve_codec.js';
import { solidScriptCurveFromText } from '@/solid_script/language/solid_script_curve_read.js';
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

/**
 * Escapes field-special characters ($, [, ]) in encoded curve JSON so field
 * parsing keeps it as literal text.
 *
 * @param raw Encoded curve JSON.
 * @returns Field-safe text.
 */
function solidScriptCurveEscape(raw: string): string {
  return raw.replace(/[$[]]/g, (ch) => `$${ch}`);
}

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
 * Decodes stored curve text with or without field bracket escaping.
 *
 * @param text Stored text.
 * @param raw True when the field holds unescaped JSON.
 * @returns Decoded curve, or null.
 */
function solidScriptCurveStoredDecode(text: string, raw: boolean): Curve | null {
  return solidScriptCurveFromText(raw ? text.trim() : solidScriptFieldUnescape(text.trim()));
}

/**
 * Returns whether the field should open in Pick mode for its stored value.
 *
 * @param text Stored text.
 * @param raw True when the field holds unescaped JSON.
 * @returns True to open in Pick mode.
 */
function solidScriptCurveShouldPick(text: string, raw: boolean): boolean {
  if (solidScriptCurveStoredDecode(text, raw)) return true;
  return !solidScriptCurveHasBracket(text);
}

/**
 * Builds a curve field: the shared curve editor strip with presets and markers,
 * or typing for a variable or formula. It opens in Pick mode unless the stored
 * text uses an unescaped [ ], and keeps unedited stored text unchanged.
 *
 * @param input Text input holding the stored text.
 * @param parameter Parameter with curve settings.
 * @param inputs Container element.
 * @param problem Checks typed text when not picking.
 * @param resources Curve resources of the script, such as $Resources.Wall.
 * @returns Reader and validation check.
 */
export function solidScriptConfiguratorCurve(
  input: HTMLInputElement,
  parameter: SolidScriptCommandParameter,
  inputs: HTMLElement,
  problem: () => string,
  resources: readonly string[] = [],
): { read: () => string; problem: () => string } {
  const curve = parameter.curve!;
  const field = new SolidScriptConfiguratorCurveField(input, parameter.label, curve, inputs, resources);
  return {
    read: () => {
      if (field.picking) return field.readPicked();
      const typed = input.value.trim();
      return !curve.raw && typed.startsWith('{') && solidScriptCurveFromText(typed)
        ? solidScriptCurveEscape(typed)
        : typed;
    },
    problem: () => {
      if (field.picking) return '';
      return solidScriptCurveFromText(input.value.trim()) ? '' : problem();
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

/** A curve field switching between the curve editor strip and text typing. */
class SolidScriptConfiguratorCurveField {
  /** True while the curve preview shows, false while the text input does. */
  picking: boolean;
  /** Escaped encoded curve chosen in Pick mode, or null while unedited. */
  private picked: string | null = null;
  private readonly curveField: CurveField;
  private readonly host = document.createElement('div');
  private readonly modes: HTMLButtonElement[];
  /** Picks a curve resource of the script, or the curve edited here. */
  private readonly resource = document.createElement('select');
  /** Text of the curve edited here, kept while a resource is picked. */
  private own = '';

  /**
   * Builds the curve field into its container.
   *
   * @param input Text input with the stored text.
   * @param label Caption of the field.
   * @param curve Curve editor settings.
   * @param inputs Container.
   * @param resources Curve resources of the script.
   */
  constructor(
    private readonly input: HTMLInputElement,
    private readonly label: string,
    private readonly curve: SolidScriptCommandCurve,
    private readonly inputs: HTMLElement,
    private readonly resources: readonly string[],
  ) {
    this.picking =
      this.resourceOf(input.value) !== '' || solidScriptCurveShouldPick(input.value, this.curve.raw === true);
    this.own = this.resourceOf(input.value) === '' ? input.value : '';
    this.resourceBuild();
    this.curveField = new CurveField({
      label,
      presets: curve.presets,
      fileName: label,
      onPreview: () => undefined,
      onCommit: (next) => {
        const encoded = curveEncode(next);
        const escaped = curve.raw ? encoded : solidScriptCurveEscape(encoded);
        this.picked = escaped;
        this.own = escaped;
        this.input.value = escaped;
        this.changed();
      },
      ...(curve.markers ? { markers: MODIFIER_STACK_CURVE_MARKER_STYLE } : {}),
    });
    this.host.style.flex = '1 1 0';
    this.host.style.minWidth = '0';
    this.host.append(this.curveField.getElement());
    this.modes = (['Pick', 'Type'] as const).map((mode) => this.modeButton(mode));
    this.writePreview(input.value);
    this.show();
    input.addEventListener('input', () => this.follow());
    inputs.append(...this.modes, this.resource, this.host, input);
  }

  /** Fills the resource picker: the curve edited here, then each curve resource. */
  private resourceBuild(): void {
    this.resource.setAttribute('aria-label', `${this.label} resource`);
    this.resource.className = SOLID_SCRIPT_EDITOR_CLASSES.input;
    const own = new Option('Edit Here', '');
    this.resource.append(own, ...this.resources.map((name) => new Option(`[${name}]`, `[${name}]`)));
    this.resource.value = this.resourceOf(this.input.value);
    this.resource.addEventListener('change', () => {
      this.picked = this.resource.value === '' ? this.own : this.resource.value;
      this.input.value = this.picked;
      this.show();
      this.changed();
    });
  }

  /**
   * Finds the curve resource field text names.
   *
   * @param text Field text.
   * @returns Text such as [$Resources.Wall], or empty when it names none.
   */
  private resourceOf(text: string): string {
    const trimmed = text.trim();
    return this.resources.some((name) => `[${name}]` === trimmed) ? trimmed : '';
  }

  /**
   * Returns the stored text in Pick mode, preserving unedited text verbatim.
   *
   * @returns Stored text or newly picked escaped curve.
   */
  readPicked(): string {
    return this.picked ?? this.input.value.trim();
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
        ? 'Pick or edit a curve in the curve editor, or drop an .aicurve file'
        : 'Type a Curve input variable, formula or curve text';
    const button = solidScriptEditorToolButton(mode, mode.toLowerCase(), tip, () => this.switch(mode === 'Pick'));
    button.setAttribute('aria-label', `${mode} ${this.label}`);
    return button;
  }

  /**
   * Switches between picking and typing, keeping stored values synchronized.
   *
   * @param picking True to pick.
   */
  private switch(picking: boolean): void {
    if (picking === this.picking) return;
    if (this.picking && this.picked !== null) this.input.value = this.picked;
    else if (!this.picking) this.writePreview(this.input.value);
    this.picking = picking;
    this.show();
    this.changed();
  }

  /**
   * Follows text written into the input while picking, such as by the formula
   * window.
   */
  private follow(): void {
    this.picked = null;
    if (!this.picking) return;
    this.picking =
      this.resourceOf(this.input.value) !== '' || solidScriptCurveShouldPick(this.input.value, this.curve.raw === true);
    this.resource.value = this.resourceOf(this.input.value);
    if (this.picking) this.writePreview(this.input.value);
    this.show();
  }

  /** Updates the curve strip preview from stored text or fallback. */
  private writePreview(text: string): void {
    const decoded =
      solidScriptCurveStoredDecode(text, this.curve.raw === true) ??
      solidScriptCurveFromText(this.curve.fallback) ??
      solidScriptCurveDefault();
    this.curveField.setCurve(decoded);
  }

  /** Shows the curve preview or the text input, and updates mode toggle state. */
  private show(): void {
    this.resource.hidden = !this.picking || this.resources.length === 0;
    this.host.hidden = !this.picking || this.resource.value !== '';
    this.input.hidden = this.picking;
    this.modes.forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0) === this.picking)));
  }

  /** Tells the field it changed. */
  private changed(): void {
    this.inputs.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
