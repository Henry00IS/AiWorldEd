import type { SolidScriptExpression } from './solid_script_ast.js';
import type { SolidScriptCompiled } from './solid_script_expression_compile.js';
import type { SolidScriptFieldContext } from './solid_script_field.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';

/** What a field reader asks of the running script. */
export interface SolidScriptFieldHost {
  /**
   * Reads any variable name as written, such as points(2) or Box.Width; throws
   * when there is none.
   *
   * @param name Name as written.
   * @param scope Scope of the running line.
   */
  fieldVariable(name: string, scope: SolidScriptScope): SolidScriptValue;
  /**
   * Reads a variable of the innermost Function running, by its name after
   * $local.
   *
   * @param bare Name after $local.
   */
  fieldLocal(bare: string): SolidScriptValue;
  /**
   * Computes formula text; throws when it cannot be read.
   *
   * @param text Formula text.
   * @param scope Scope of the running line.
   */
  fieldFormula(text: string, scope: SolidScriptScope): SolidScriptValue;
  /**
   * Computes a compiled formula.
   *
   * @param formula Compiled formula.
   * @param scope Scope of the running line.
   */
  fieldFormulaRun(formula: SolidScriptCompiled, scope: SolidScriptScope): SolidScriptValue;
  /**
   * Parses formula text, or returns null when it cannot be read.
   *
   * @param text Formula text.
   */
  fieldFormulaParse(text: string): SolidScriptExpression | null;
}

/**
 * What field text reads in one scope of a running script: one object per scope,
 * whose reads go to the scope first and to the script for anything unusual.
 */
export class SolidScriptFieldReader implements SolidScriptFieldContext {
  /**
   * Creates the reader of a scope.
   *
   * @param host Running script.
   * @param scope Scope the fields are read in.
   */
  constructor(
    private readonly host: SolidScriptFieldHost,
    private readonly scope: SolidScriptScope,
  ) {}

  /**
   * Reads any variable name as written.
   *
   * @param name Name as written.
   * @returns Value.
   */
  variable(name: string): SolidScriptValue {
    return this.host.fieldVariable(name, this.scope);
  }

  /**
   * Reads a plain name such as width.
   *
   * @param name Name.
   * @returns Value.
   */
  variablePlain(name: string): SolidScriptValue {
    const found = this.scope.variableGet(name);
    return found !== undefined ? found : this.host.fieldVariable(name, this.scope);
  }

  /**
   * Reads a Function's own variable written local.name.
   *
   * @param bare Name after $local.
   * @param name Name as written.
   * @returns Value.
   */
  variableLocal(bare: string, name: string): SolidScriptValue {
    const found = this.host.fieldLocal(bare);
    return found !== undefined ? found : this.host.fieldVariable(name, this.scope);
  }

  /**
   * Reads one part of a vector variable such as Pos.X.
   *
   * @param base Vector variable name.
   * @param index Position of the part.
   * @param name Name as written.
   * @returns Value.
   */
  variableComponent(base: string, index: number, name: string): SolidScriptValue {
    const vector = this.scope.variableGet(base);
    const found = Array.isArray(vector) ? vector[index] : undefined;
    return found !== undefined ? found : this.host.fieldVariable(name, this.scope);
  }

  /**
   * Reads an item of a list variable such as points([i]).
   *
   * @param list Key of the list variable name.
   * @param index Item number.
   * @returns Value.
   */
  variableItem(list: string, index: SolidScriptValue): SolidScriptValue {
    const items = this.scope.variableGet(list);
    const found =
      Array.isArray(items) && typeof index === 'number' && Number.isInteger(index) && index >= 0
        ? items[index]
        : undefined;
    return found !== undefined
      ? found
      : this.host.fieldVariable(solidScriptNameKey(`${list}(${solidScriptValueText(index)})`), this.scope);
  }

  /**
   * Computes formula text.
   *
   * @param text Formula text.
   * @returns Value.
   */
  formula(text: string): SolidScriptValue {
    return this.host.fieldFormula(text, this.scope);
  }

  /**
   * Parses formula text once.
   *
   * @param text Formula text.
   * @returns Parsed formula, or null.
   */
  formulaParse(text: string): SolidScriptExpression | null {
    return this.host.fieldFormulaParse(text);
  }

  /**
   * Computes a compiled formula.
   *
   * @param formula Compiled formula.
   * @returns Value.
   */
  formulaRun(formula: SolidScriptCompiled): SolidScriptValue {
    return this.host.fieldFormulaRun(formula, this.scope);
  }
}
