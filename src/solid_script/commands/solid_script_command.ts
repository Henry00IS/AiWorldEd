/** Editor a configurator shows for one command parameter. */
export type SolidScriptCommandParameterType =
  'number' | 'vector2' | 'vector3' | 'boolean' | 'expression' | 'name' | 'text';

/** Palette group of a command, in palette order. */
export type SolidScriptCommandCategory = 'Solids' | '2D Shapes' | 'Transforms' | 'Combine' | 'Logic';

/** One labelled value of a command line. */
export interface SolidScriptCommandParameter {
  /** Argument name in the generated code, and the key of the stored value. */
  key: string;
  /** Visible caption. */
  label: string;
  /** Editor the configurator shows. */
  type: SolidScriptCommandParameterType;
  /** Value of a new command line, as code text. */
  default: string;
  /** Hover text explaining the value. */
  hint: string;
  /** True writes the value without its name, such as the message of Echo. */
  positional?: boolean;
}

/** Stored values of one command line, as code text per parameter key. */
export type SolidScriptCommandValues = Readonly<Record<string, string>>;

/**
 * Base class of the commands a script editor offers: each turns its stored
 * values into exactly one line of solid script code.
 */
export abstract class SolidScriptCommand {
  /** Stable id stored in scripts. */
  abstract readonly id: string;
  /** Visible name. */
  abstract readonly label: string;
  /** Palette group. */
  abstract readonly category: SolidScriptCommandCategory;
  /** One-line description shown as hover help. */
  abstract readonly description: string;
  /** Values a configurator edits. */
  abstract readonly parameters: readonly SolidScriptCommandParameter[];
  /** True when the line opens a block that a matching End line closes. */
  readonly opensBlock: boolean = false;
  /** False hides the command from the palette, such as End. */
  readonly inPalette: boolean = true;

  /**
   * Writes the code line of the command.
   *
   * @param values Values by parameter key; missing ones use their default.
   * @returns One line of code.
   */
  abstract code(values: SolidScriptCommandValues): string;

  /**
   * Returns the values of a new command line.
   *
   * @returns Default value per parameter key.
   */
  valuesDefault(): Record<string, string> {
    return Object.fromEntries(this.parameters.map((parameter) => [parameter.key, parameter.default]));
  }

  /**
   * Returns one value, falling back to the parameter default, on one line.
   *
   * @param values Stored values.
   * @param key Parameter key.
   * @returns Code text.
   */
  protected value(values: SolidScriptCommandValues, key: string): string {
    const stored = values[key];
    const fallback = this.parameters.find((parameter) => parameter.key === key)?.default ?? '';
    const text = stored === undefined || stored.trim() === '' ? fallback : stored;
    return text.replace(/[\r\n]+/g, ' ').trim();
  }

  /**
   * Describes a command line in words, for the line itself and tooltips.
   *
   * @param values Stored values.
   * @returns Label followed by each value.
   */
  summary(values: SolidScriptCommandValues): string {
    const parts = this.parameters.map((parameter) => `${parameter.label} ${this.value(values, parameter.key)}`);
    return parts.length > 0 ? `${this.label}  ${parts.join('  ·  ')}` : this.label;
  }
}
