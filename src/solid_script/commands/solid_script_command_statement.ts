import {
  SolidScriptCommand,
  type SolidScriptCommandCategory,
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
  /** True when the statement opens a block that End closes. */
  opensBlock?: boolean;
  /** False hides the command from the palette. */
  inPalette?: boolean;
  /** Writes the line from the resolved value of each parameter key. */
  write: (value: (key: string) => string) => string;
}

/**
 * Command of the Logic group that writes a statement: a variable, a loop, a
 * condition, a note, or the End of a block.
 */
export class SolidScriptCommandStatement extends SolidScriptCommand {
  readonly id: string;
  readonly label: string;
  readonly category: SolidScriptCommandCategory = 'Logic';
  readonly description: string;
  readonly parameters: readonly SolidScriptCommandParameter[];
  override readonly opensBlock: boolean;
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
    this.description = spec.description;
    this.parameters = spec.parameters;
    this.opensBlock = spec.opensBlock === true;
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
