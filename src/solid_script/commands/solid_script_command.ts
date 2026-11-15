import type { SolidScriptBlockRun, SolidScriptMachineCommand } from '@/solid_script/language/solid_script_machine.js';
import type { SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptFieldKind } from '@/solid_script/language/solid_script_field.js';
import {
  solidScriptListingBuild,
  solidScriptListingText,
  solidScriptListingValue,
  type SolidScriptListingPart,
  type SolidScriptListingValues,
  type SolidScriptListingWrite,
} from './solid_script_command_listing.js';

/** How a command field reads its text, which also picks its configurator editor. */
export type SolidScriptCommandParameterType = SolidScriptFieldKind;

/** Palette group of a command, in palette order. */
export type SolidScriptCommandCategory = 'Solids' | '2D Shapes' | 'Transforms' | 'Combine' | 'Logic' | 'Parts';

/**
 * How a command line shapes the block structure: 'open' starts a block that an
 * End line closes, 'continue' ends one branch and starts the next (Else),
 * 'close' ends a block and 'none' is a plain line.
 */
export type SolidScriptCommandNesting = 'open' | 'continue' | 'close' | 'none';

/** One field of a command line with the value it holds. */
export interface SolidScriptCommandEntry {
  /** Field key. */
  key: string;
  /** Visible caption. */
  label: string;
  /** Value as typed; the default when the line has none. */
  value: string;
}

/** One labelled field of a command line. */
export interface SolidScriptCommandParameter {
  /** Key of the stored value. */
  key: string;
  /** Visible caption. */
  label: string;
  /** Editor the configurator shows. */
  type: SolidScriptCommandParameterType;
  /** Value of a new command line, as typed. */
  default: string;
  /** Hover text explaining the value. */
  hint: string;
}

/** Stored values of one command line, as typed per field key. */
export type SolidScriptCommandValues = Readonly<Record<string, string>>;

/** Everything that defines one command. */
export interface SolidScriptCommandSpec {
  /** Stable id stored in scripts. */
  id: string;
  /** Visible name. */
  label: string;
  /** Palette group. */
  category: SolidScriptCommandCategory;
  /** Short description in a few words, shown in the palette and as hover help. */
  description: string;
  /**
   * Plain explanation of what the line does to the shape, with an example, for
   * the help panel.
   */
  manual: string;
  /**
   * Mistakes that stop the script at this line, in plain words; none when
   * omitted.
   */
  stops?: readonly string[];
  /** Fields a configurator edits. */
  parameters: readonly SolidScriptCommandParameter[];
  /** How the line shapes the block structure; a plain line when omitted. */
  nesting?: SolidScriptCommandNesting;
  /** False hides the command from the palette, such as End. */
  inPalette?: boolean;
  /** False for lines that do nothing when run, such as notes. */
  runs?: boolean;
  /** Writes the line as the script listing shows it. */
  listing: SolidScriptListingWrite;
  /** Runs the line. */
  execute: (run: SolidScriptBlockRun) => SolidScriptShape[];
}

/**
 * One command of the script editor: how its line looks in the listing, what its
 * fields mean and what it does when the script runs.
 */
export class SolidScriptCommand implements SolidScriptMachineCommand {
  readonly id: string;
  readonly label: string;
  readonly category: SolidScriptCommandCategory;
  readonly description: string;
  readonly manual: string;
  readonly stops: readonly string[];
  readonly parameters: readonly SolidScriptCommandParameter[];
  readonly nesting: SolidScriptCommandNesting;
  readonly inPalette: boolean;
  readonly runs: boolean;
  private readonly listingWrite: SolidScriptListingWrite;
  private readonly run: SolidScriptCommandSpec['execute'];

  /**
   * Creates the command.
   *
   * @param spec Id, texts, fields, listing and run step.
   */
  constructor(spec: SolidScriptCommandSpec) {
    this.id = spec.id;
    this.label = spec.label;
    this.category = spec.category;
    this.description = spec.description;
    this.manual = spec.manual;
    this.stops = spec.stops ?? [];
    this.parameters = spec.parameters;
    this.nesting = spec.nesting ?? 'none';
    this.inPalette = spec.inPalette !== false;
    this.runs = spec.runs !== false;
    this.listingWrite = spec.listing;
    this.run = spec.execute;
  }

  /**
   * Runs the line.
   *
   * @param run What the line can read and do.
   * @returns Shapes it builds.
   */
  execute(run: SolidScriptBlockRun): SolidScriptShape[] {
    return this.run(run);
  }

  /**
   * Returns the values of a new command line.
   *
   * @returns Default value per field key.
   */
  valuesDefault(): Record<string, string> {
    return Object.fromEntries(this.parameters.map((parameter) => [parameter.key, parameter.default]));
  }

  /**
   * Returns one value on one line, falling back to the field default when
   * empty.
   *
   * @param values Stored values.
   * @param key Field key.
   * @returns Value as typed.
   */
  valueText(values: SolidScriptCommandValues, key: string): string {
    const stored = values[key];
    const fallback = this.parameters.find((parameter) => parameter.key === key)?.default ?? '';
    const text = stored === undefined || stored.trim() === '' ? fallback : stored;
    return text.replace(/[\r\n]+/g, ' ').trim();
  }

  /**
   * Lists the fields of a command line with their values.
   *
   * @param values Stored values.
   * @returns One entry per field, in field order.
   */
  entries(values: SolidScriptCommandValues): SolidScriptCommandEntry[] {
    return this.parameters.map(({ key, label }) => ({ key, label, value: this.valueText(values, key) }));
  }

  /**
   * Returns the line as the script listing shows it, in pieces: the command
   * name, then its values with connecting words. Options only appear when they
   * are switched on or changed.
   *
   * @param values Stored values.
   * @returns Listing pieces.
   */
  listing(values: SolidScriptCommandValues): SolidScriptListingPart[] {
    const read: SolidScriptListingValues = {
      value: (key) => solidScriptListingValue(this.valueText(values, key)),
      variable: (key) => ({ kind: 'variable', text: `[${this.valueText(values, key)}]` }),
      text: (key) => this.valueText(values, key),
      on: (key) => this.valueText(values, key) === 'true',
      changed: (key) =>
        this.valueText(values, key) !== (this.parameters.find((parameter) => parameter.key === key)?.default ?? ''),
    };
    const [first, ...rest] = this.listingWrite(read);
    if (typeof first === 'string') return solidScriptListingBuild(first, rest);
    return [first, ...rest].filter(
      (piece): piece is SolidScriptListingPart => typeof piece === 'object' && piece !== null,
    );
  }

  /**
   * Returns the line as the script listing shows it.
   *
   * @param values Stored values.
   * @returns Line text.
   */
  listingText(values: SolidScriptCommandValues): string {
    return solidScriptListingText(this.listing(values));
  }
}
