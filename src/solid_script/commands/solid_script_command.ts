import { solidScriptFieldBoolean } from '@/solid_script/language/solid_script_field.js';
import type { SolidScriptAnchorAxis } from '@/solid_script/language/solid_script_anchor.js';
import type {
  SolidScriptBlockRun,
  SolidScriptMachineCommand,
} from '@/solid_script/language/solid_script_machine_types.js';
import { SOLID_SCRIPT_SHAPE_NAME_KEY, type SolidScriptShape } from '@/solid_script/language/solid_script_shape.js';
import type { SolidScriptSystemFillName } from '@/solid_script/language/solid_script_system_names.js';
import type { SolidScriptFieldKind } from '@/solid_script/language/solid_script_field.js';
import {
  solidScriptListingBuild,
  solidScriptListingText,
  solidScriptListingValue,
  type SolidScriptListingPart,
  type SolidScriptListingValues,
  type SolidScriptListingWrite,
} from './solid_script_command_listing.js';
import { solidScriptParameterInto, solidScriptParameterShapeName } from './solid_script_command_parameters.js';
import { solidScriptParameterEachActive, type SolidScriptCommandEach } from './solid_script_command_each.js';

/** How a command field reads its text, which also picks its configurator editor. */
export type SolidScriptCommandParameterType = SolidScriptFieldKind;

/**
 * How a field that names a variable offers names: plain names, whole paths a
 * Set can write, or none for a name the line defines but no line may write,
 * such as an Input.
 */
export type SolidScriptCommandParameterWrites = 'name' | 'path' | 'none';

/**
 * Kinds of value a field accepts, read by the editor checks, the help and the
 * errors of a running line; Any for a field that takes any value.
 */
export type SolidScriptCommandAccepts = 'Any' | readonly string[];

/**
 * What kind a field gives the variable it names, read by the editor checks and
 * the names list: a fixed kind, the kinds of another field's value, its items
 * or its keys, the kind the word typed in another field gives, what the called
 * Function returns, a list for a name not set yet, the kind the variable
 * already holds, emptied (Clear Variable) or with items taken out, nothing
 * because the line forgets it, or the kind it holds because the line only reads
 * it. What describes it, with {key} for the text of another field and {command}
 * for the line's block.
 */
export type SolidScriptCommandGives =
  | { readonly rule: 'kind'; readonly kind: string; readonly what: string }
  | { readonly rule: 'value' | 'item' | 'key' | 'word'; readonly field: string; readonly what: string }
  | { readonly rule: 'returned' | 'list'; readonly what: string }
  | { readonly rule: 'kept' | 'emptied' | 'shrunk' | 'forgotten' | 'read' | 'defines' };

/**
 * A field naming a variable the line writes: how it offers names and what it
 * gives.
 */
export interface SolidScriptCommandWrites {
  /** How the field offers names as they are typed. */
  readonly offers: SolidScriptCommandParameterWrites;
  /** What the variable holds after the line. */
  readonly gives: SolidScriptCommandGives;
}

/**
 * What a line means for the order lines run in, read by the editor checks: a
 * choice of its lines (If), a loop, a Function, a part or a When block whose
 * lines run elsewhere, a Call or Use Part that runs them, or a Return. Each
 * names the fields it reads.
 */
export type SolidScriptCommandFlow =
  | { readonly kind: 'choice'; readonly condition?: string }
  | { readonly kind: 'loop' }
  | { readonly kind: 'handler'; readonly name?: string }
  | { readonly kind: 'function'; readonly name: string; readonly inputs: string }
  | { readonly kind: 'part' | 'use_part'; readonly name: string }
  | { readonly kind: 'call'; readonly name: string; readonly values: string }
  | { readonly kind: 'return'; readonly value: string };

/** Palette group of a command, in palette order. */
export type SolidScriptCommandCategory =
  | 'Solids'
  | 'Generators'
  | '2D Shapes'
  | 'Transforms'
  | 'Combine'
  | 'Meshes'
  | 'Faces'
  | 'Inputs'
  | 'Logic'
  | 'Lists'
  | 'Parts';

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
  /** True when the field may stay empty. */
  optional?: boolean;
  /** The few words the field takes, offered first while it is typed. */
  words?: readonly SolidScriptCommandWord[];
  /** True for a library texture: the window offers the texture picker or typing. */
  texture?: boolean;
  /**
   * Name groups of the script the field offers, such as Brushes and Parts for
   * Of, Inputs for Show Inputs When or Parts for Use Part.
   */
  nameGroups?: readonly string[];
  /** Kinds of value the field accepts. */
  accepts: SolidScriptCommandAccepts;
  /**
   * Set for a field naming a variable the line writes or changes: what it gives
   * the variable, and how it offers names: name offers the script's variables
   * as they are typed, path also the writable [$Selected.*] lists and, after a
   * dot, the members that lead to a value a line can set, such as
   * Brush.Edges.Data.
   */
  writes?: SolidScriptCommandWrites;
  /** Greyed text an empty field shows, such as the list an empty Of uses. */
  placeholder?: string;
  /**
   * When set, the configurator and the help show this field only while the
   * named field holds one of these words. A value that is not one of that
   * field's words, such as a variable, shows the field, because the choice is
   * only known when the script runs.
   */
  when?: { readonly field: string; readonly words: readonly string[] };
  /** Axes of an Anchor field, which the window shows as one choice per axis. */
  anchor?: readonly SolidScriptAnchorAxis[];
  /**
   * When set, the field is worked out once per Face, Edge, Vertex or Point,
   * with that element filled in as $Face, $Edge, $Vertex or $Point and $Index.
   */
  each?: SolidScriptCommandEach;
  /**
   * When set, the field is only per-element while the named field holds one of
   * these words, such as Detail of Select Faces while Which is Where.
   */
  eachWhen?: { readonly field: string; readonly words: readonly string[] };
}

/** One word a field takes, with what it means. */
export interface SolidScriptCommandWord {
  /** Word as typed. */
  word: string;
  /** Short meaning shown beside it. */
  detail: string;
  /**
   * Kind of value the word stands for, such as Number for an Input of Type
   * number.
   */
  gives?: string;
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
  /** What the line means for the order lines run in; a plain line when omitted. */
  flow?: SolidScriptCommandFlow;
  /** Names the line fills in for its own formulas, such as $NZ for each face. */
  fills?: readonly SolidScriptSystemFillName[];
  /**
   * Word the End line of an open block shows after "End", such as "When" for
   * "End When"; the label when omitted. The opening line names the block in
   * full, the End line stays short.
   */
  endLabel?: string;
  /** False hides the command from the palette, such as End. */
  inPalette?: boolean;
  /**
   * True adds the optional Name field of shapes; on by default for solids, 2D
   * shapes and generators.
   */
  named?: boolean;
  /** False for lines that do nothing when run, such as notes. */
  runs?: boolean;
  /** Writes the line as the script listing shows it. */
  listing: SolidScriptListingWrite;
  /** Runs the line. */
  execute: (run: SolidScriptBlockRun) => SolidScriptShape[];
}

/** Palette groups whose lines build shapes, which get the optional Name field. */
const SOLID_SCRIPT_COMMAND_NAMED: readonly SolidScriptCommandCategory[] = ['Solids', '2D Shapes', 'Generators'];

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
  readonly flow: SolidScriptCommandFlow | undefined;
  readonly fills: readonly SolidScriptSystemFillName[];
  readonly endLabel: string;
  readonly inPalette: boolean;
  readonly runs: boolean;
  /** True for blocks that build brushes or meshes, with Name and Into. */
  readonly builds: boolean;
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
    const named = spec.named ?? SOLID_SCRIPT_COMMAND_NAMED.includes(spec.category);
    // Blocks that build brushes or meshes also write them Into a variable; flat outlines do not.
    this.builds = named && spec.category !== '2D Shapes';
    this.parameters = named
      ? [
          ...spec.parameters,
          solidScriptParameterShapeName(),
          ...(this.builds
            ? [solidScriptParameterInto('the brushes or meshes it builds', 'Brush', 'what is made')]
            : []),
        ]
      : spec.parameters;
    this.nesting = spec.nesting ?? 'none';
    this.flow = spec.flow;
    this.fills = spec.fills ?? [];
    this.endLabel = spec.endLabel ?? spec.label;
    this.inPalette = spec.inPalette !== false;
    this.runs = spec.runs !== false;
    this.listingWrite = named
      ? (read) => {
          const pieces = spec.listing(read);
          const name = read.text(SOLID_SCRIPT_SHAPE_NAME_KEY);
          const into = this.builds ? read.text('into') : '';
          return [...pieces, ...(name === '' ? [] : [' Named ', name]), ...(into === '' ? [] : [' Into ', into])];
        }
      : spec.listing;
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
   * Lists one configured value, and marks it when the field is worked out once
   * per element for these values.
   *
   * @param values Stored values.
   * @param key Field key.
   * @returns Listing piece.
   */
  private listingValue(values: SolidScriptCommandValues, key: string): SolidScriptListingPart {
    const part = solidScriptListingValue(this.valueText(values, key));
    const parameter = this.parameters.find((entry) => entry.key === key);
    if (parameter && solidScriptParameterEachActive(parameter, values)) part.each = true;
    return part;
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
      value: (key) => this.listingValue(values, key),
      variable: (key) => ({ kind: 'variable', text: `[${this.valueText(values, key)}]` }),
      text: (key) => this.valueText(values, key),
      on: (key) => solidScriptFieldBoolean(this.valueText(values, key)) === true,
      changed: (key) =>
        solidScriptFieldBoolean(this.valueText(values, key)) !==
        solidScriptFieldBoolean(this.parameters.find((parameter) => parameter.key === key)?.default ?? ''),
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
