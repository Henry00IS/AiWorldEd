import {
  SolidScriptCommand,
  type SolidScriptCommandCategory,
  type SolidScriptCommandNesting,
  type SolidScriptCommandParameter,
  type SolidScriptCommandValues,
} from './solid_script_command.js';

/** Description of a command that writes a statement other than a module call. */
export interface SolidScriptCommandStatementSpec {
  /** Command id. */
  id: string;
  /** Visible name. */
  label: string;
  /** Hover help. */
  description: string;
  /** Values. */
  parameters: readonly SolidScriptCommandParameter[];
  /** Palette group; Logic when omitted. */
  category?: SolidScriptCommandCategory;
  /** How the line shapes the block structure; a plain line when omitted. */
  nesting?: SolidScriptCommandNesting;
  /** False hides the command from the palette. */
  inPalette?: boolean;
  /** Writes the line from the resolved value of each parameter key. */
  write: (value: (key: string) => string) => string;
}

/**
 * Command that writes a statement rather than a module call: a variable, a
 * loop, a condition, a part, a note, a blank line or the End of a block.
 */
export class SolidScriptCommandStatement extends SolidScriptCommand {
  readonly id: string;
  readonly label: string;
  readonly category: SolidScriptCommandCategory;
  readonly description: string;
  readonly parameters: readonly SolidScriptCommandParameter[];
  override readonly nesting: SolidScriptCommandNesting;
  override readonly inPalette: boolean;
  private readonly write: SolidScriptCommandStatementSpec['write'];

  /**
   * Creates the command.
   *
   * @param spec Id, labels, values and line writer.
   */
  constructor(spec: SolidScriptCommandStatementSpec) {
    super();
    this.id = spec.id;
    this.label = spec.label;
    this.category = spec.category ?? 'Logic';
    this.description = spec.description;
    this.parameters = spec.parameters;
    this.nesting = spec.nesting ?? 'none';
    this.inPalette = spec.inPalette !== false;
    this.write = spec.write;
  }

  /**
   * Writes the statement line.
   *
   * @param values Values by parameter key.
   * @returns Code line.
   */
  code(values: SolidScriptCommandValues): string {
    return this.write((key) => this.value(values, key));
  }
}
