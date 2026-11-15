import {
  SolidScriptCommand,
  type SolidScriptCommandCategory,
  type SolidScriptCommandParameter,
  type SolidScriptCommandValues,
} from './solid_script_command.js';

/** Description of a command that calls one built-in module. */
export interface SolidScriptCommandModuleSpec {
  /** Module name, also the command id. */
  module: string;
  /** Visible name. */
  label: string;
  /** Palette group. */
  category: SolidScriptCommandCategory;
  /** Hover help. */
  description: string;
  /** Arguments. */
  parameters: readonly SolidScriptCommandParameter[];
  /** True when the module applies to the lines up to its End. */
  opensBlock?: boolean;
}

/** Command that calls a built-in module: "cube(size = [1, 1, 1]);". */
export class SolidScriptCommandModule extends SolidScriptCommand {
  readonly id: string;
  readonly label: string;
  readonly category: SolidScriptCommandCategory;
  readonly description: string;
  readonly parameters: readonly SolidScriptCommandParameter[];
  override readonly opensBlock: boolean;

  /**
   * Creates the command.
   *
   * @param spec Module, labels and arguments.
   */
  constructor(spec: SolidScriptCommandModuleSpec) {
    super();
    this.id = spec.module;
    this.label = spec.label;
    this.category = spec.category;
    this.description = spec.description;
    this.parameters = spec.parameters;
    this.opensBlock = spec.opensBlock === true;
  }

  /**
   * Writes the module call, opening a block when the module takes children.
   *
   * @param values Values by parameter key.
   * @returns Code line.
   */
  code(values: SolidScriptCommandValues): string {
    const args = this.parameters.map((parameter) => {
      const text = this.value(values, parameter.key);
      return parameter.positional ? text : `${parameter.key} = ${text}`;
    });
    return `${this.id}(${args.join(', ')})${this.opensBlock ? ' {' : ';'}`;
  }
}
