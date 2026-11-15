import type { ScadArgument, ScadBinding, ScadExpression, ScadParameter } from './scad_ast.js';
import { scadArithmeticBinary } from './scad_arithmetic.js';
import { SCAD_FUNCTIONS_BUILTIN } from './scad_functions_builtin.js';
import { ScadScope } from './scad_scope.js';
import { SCAD_LIST_LIMIT, scadValueNumber, scadValueTruthy, type ScadValue } from './scad_value.js';

/** Deepest allowed user function recursion. */
const SCAD_RECURSION_LIMIT = 500;

/** Vector member names and their indices. */
const SCAD_MEMBERS: Readonly<Record<string, number>> = { x: 0, y: 1, z: 2 };

/** Evaluates expressions of the supported OpenSCAD subset. */
export class ScadExpressionEvaluator {
  private depth = 0;

  /**
   * Evaluates an expression.
   *
   * @param expression Expression.
   * @param scope Scope for names.
   * @returns Value.
   */
  evaluate(expression: ScadExpression, scope: ScadScope): ScadValue {
    switch (expression.kind) {
      case 'number':
      case 'string':
      case 'boolean':
        return expression.value;
      case 'undef':
        return undefined;
      case 'variable':
        return expression.name === 'PI' ? Math.PI : scope.variableGet(expression.name);
      case 'vector':
        return expression.items.map((item) => this.evaluate(item, scope));
      case 'call':
        return this.evaluateCall(expression.name, expression.args, scope);
      default:
        return this.evaluateCompound(expression, scope);
    }
  }

  /**
   * Evaluates operators, calls, ranges and comprehensions.
   *
   * @param expression Expression.
   * @param scope Scope.
   * @returns Value.
   */
  private evaluateCompound(expression: ScadExpression, scope: ScadScope): ScadValue {
    switch (expression.kind) {
      case 'unary':
        return this.evaluateUnary(expression.operator, this.evaluate(expression.operand, scope));
      case 'binary':
        return this.evaluateBinary(expression.operator, expression.left, expression.right, scope);
      case 'ternary': {
        const truthy = scadValueTruthy(this.evaluate(expression.condition, scope));
        return this.evaluate(truthy ? expression.whenTrue : expression.whenFalse, scope);
      }
      case 'index':
        return this.evaluateIndex(this.evaluate(expression.target, scope), this.evaluate(expression.index, scope));
      case 'member':
        return this.evaluateIndex(this.evaluate(expression.target, scope), SCAD_MEMBERS[expression.name]);
      case 'range':
        return this.rangeValues(expression, scope);
      case 'comprehension':
        return this.bindingsWalk(expression.bindings, scope, (inner) => [this.evaluate(expression.body, inner)]);
      default:
        return undefined;
    }
  }

  /**
   * Applies a prefix operator.
   *
   * @param operator Operator symbol.
   * @param value Operand.
   * @returns Result.
   */
  private evaluateUnary(operator: string, value: ScadValue): ScadValue {
    if (operator === '!') return !scadValueTruthy(value);
    if (operator === '+') return value;
    return scadArithmeticBinary('*', -1, value);
  }

  /**
   * Applies a binary operator, short-circuiting logic operators.
   *
   * @param operator Operator symbol.
   * @param left Left expression.
   * @param right Right expression.
   * @param scope Scope.
   * @returns Result.
   */
  private evaluateBinary(operator: string, left: ScadExpression, right: ScadExpression, scope: ScadScope): ScadValue {
    const leftValue = this.evaluate(left, scope);
    if (operator === '&&' && !scadValueTruthy(leftValue)) return false;
    if (operator === '||' && scadValueTruthy(leftValue)) return true;
    return scadArithmeticBinary(operator, leftValue, this.evaluate(right, scope));
  }

  /**
   * Indexes a vector or string.
   *
   * @param target Indexed value.
   * @param index Index value.
   * @returns Entry, or undefined.
   */
  private evaluateIndex(target: ScadValue, index: ScadValue): ScadValue {
    const position = scadValueNumber(index);
    if (position === undefined) return undefined;
    if (Array.isArray(target)) return target[Math.floor(position)];
    return typeof target === 'string' ? target[Math.floor(position)] : undefined;
  }

  /**
   * Calls a user function or a built-in function.
   *
   * @param name Function name.
   * @param args Call arguments.
   * @param scope Calling scope.
   * @returns Result.
   */
  private evaluateCall(name: string, args: ScadArgument[], scope: ScadScope): ScadValue {
    const definition = scope.functionGet(name);
    if (definition) {
      if (this.depth >= SCAD_RECURSION_LIMIT) throw new Error(`function ${name}: recursion too deep`);
      this.depth += 1;
      try {
        return this.evaluate(definition.body, this.argumentsBind(definition.params, args, scope, definition.scope));
      } finally {
        this.depth -= 1;
      }
    }
    const builtin = SCAD_FUNCTIONS_BUILTIN[name];
    if (!builtin) throw new Error(`unknown function ${name}()`);
    return builtin(args.map((arg) => this.evaluate(arg.value, scope)));
  }

  /**
   * Binds call arguments to parameters in a fresh child scope of the definition
   * scope. Named $ arguments are bound as well.
   *
   * @param params Declared parameters.
   * @param args Call arguments.
   * @param callScope Scope the arguments are evaluated in.
   * @param definitionScope Scope the definition lives in.
   * @param inner Optional scope to bind into instead of a new one.
   * @returns Scope holding the parameters.
   */
  argumentsBind(
    params: ScadParameter[],
    args: ScadArgument[],
    callScope: ScadScope,
    definitionScope: ScadScope,
    inner = new ScadScope(definitionScope),
  ): ScadScope {
    const named = new Map<string, ScadValue>();
    let positional = 0;
    for (const arg of args) {
      const value = this.evaluate(arg.value, callScope);
      const name = arg.name ?? params[positional++]?.name;
      if (name) named.set(name, value);
    }
    for (const param of params) {
      inner.variableSet(
        param.name,
        named.has(param.name)
          ? named.get(param.name)
          : param.fallback
            ? this.evaluate(param.fallback, inner)
            : undefined,
      );
    }
    for (const [name, value] of named) if (name.startsWith('$')) inner.variableSet(name, value);
    return inner;
  }

  /**
   * Expands a range into its values.
   *
   * @param range Range expression.
   * @param scope Scope.
   * @returns Values.
   */
  private rangeValues(range: Extract<ScadExpression, { kind: 'range' }>, scope: ScadScope): number[] {
    const start = scadValueNumber(this.evaluate(range.start, scope)) ?? 0;
    const end = scadValueNumber(this.evaluate(range.end, scope)) ?? 0;
    const step = range.step ? (scadValueNumber(this.evaluate(range.step, scope)) ?? 1) : 1;
    if (step === 0 || (end - start) / step > SCAD_LIST_LIMIT) throw new Error('range too long');
    const values: number[] = [];
    for (let value = start; step > 0 ? value <= end + 1e-9 : value >= end - 1e-9; value += step) values.push(value);
    return values;
  }

  /**
   * Walks nested loop bindings and concatenates what the visitor returns.
   *
   * @param bindings Loop bindings, outermost first.
   * @param scope Enclosing scope.
   * @param visit Called with a scope holding one combination of loop values.
   * @returns Concatenated visitor results.
   */
  bindingsWalk<T>(bindings: ScadBinding[], scope: ScadScope, visit: (inner: ScadScope) => T[]): T[] {
    const [first, ...rest] = bindings;
    if (!first) return visit(scope);
    const source = this.evaluate(first.value, scope);
    const values = Array.isArray(source) ? source : [source];
    return values.flatMap((value) => {
      const inner = new ScadScope(scope);
      inner.variableSet(first.name, value);
      return this.bindingsWalk(rest, inner, visit);
    });
  }
}
