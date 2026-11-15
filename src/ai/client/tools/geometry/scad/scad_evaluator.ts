import * as THREE from 'three';
import type { ScadArgument, ScadStatement } from './scad_ast.js';
import { ScadCallArguments } from './scad_call_arguments.js';
import { ScadExpressionEvaluator } from './scad_expression_evaluator.js';
import { scadExtrude } from './scad_extrude.js';
import { scadPolygonHull, type ScadPoint2 } from './scad_polygon.js';
import {
  scadCirclePoints,
  scadCubePoints,
  scadCylinderPoints,
  scadPolygonPaths,
  scadPolyhedronPoints,
  scadRadius,
  scadSpherePoints,
  scadSquarePoints,
  type ScadFragmentSettings,
} from './scad_primitives.js';
import { ScadScope } from './scad_scope.js';
import { scadShapeJoin, scadShapeLeavesPositive, type ScadShape } from './scad_shape.js';
import { scadTransformMatrix } from './scad_transforms.js';
import { scadValueNumber, scadValueText, scadValueTruthy, type ScadValue } from './scad_value.js';

/** Most solids one program may produce. */
const SCAD_SOLIDS_MAX = 2000;

/** Modules outside the subset, with the suggested alternative. */
const SCAD_UNSUPPORTED: Readonly<Record<string, string>> = {
  rotate_extrude:
    'use the column modifier generator for turned profiles, or approximate with rotated linear_extrude slices',
  minkowski: 'grow the shapes by hand or hull() copies of them',
  offset: 'draw the grown or shrunk outline with polygon()',
  text: 'text is not supported',
  import: 'files cannot be imported; describe the geometry inline',
  surface: 'height maps are not supported',
  projection: 'projection is not supported',
  resize: 'use scale() with computed factors',
};

/** 3D primitives and the points of their convex solid. */
const SCAD_SOLID_PRIMITIVES: Readonly<
  Record<string, (args: ScadCallArguments, settings: ScadFragmentSettings) => THREE.Vector3[]>
> = {
  cube: (args) => scadCubePoints(args),
  sphere: scadSpherePoints,
  cylinder: scadCylinderPoints,
  polyhedron: (args) => scadPolyhedronPoints(args),
};

/** Where shapes are being evaluated: inside linear_extrude everything is 2D. */
interface ScadContext {
  matrix: THREE.Matrix4;
  planar: boolean;
}

/** Result of evaluating a program. */
export interface ScadEvaluation {
  shapes: ScadShape[];
  messages: string[];
}

/** Evaluates OpenSCAD statements into a shape tree. */
export class ScadEvaluator {
  private readonly expressions = new ScadExpressionEvaluator();
  private readonly messages: string[] = [];
  private solids = 0;

  /**
   * Evaluates a program.
   *
   * @param statements Top-level statements.
   * @returns Shapes and echo messages.
   */
  evaluateProgram(statements: ScadStatement[]): ScadEvaluation {
    const root = new ScadScope(null, null, '');
    root.variableSet('$fn', 0);
    root.variableSet('$fa', 12);
    root.variableSet('$fs', 2);
    const shapes = this.statementsEvaluate(statements, root, { matrix: new THREE.Matrix4(), planar: false });
    return { shapes, messages: this.messages };
  }

  /**
   * Evaluates statements in a new scope: definitions and assignments first,
   * then shapes, matching OpenSCAD's per-scope variable rule.
   *
   * @param statements Statements.
   * @param parent Enclosing scope.
   * @param context Transform context.
   * @param scope Scope to evaluate in; a new child of the parent by default.
   * @returns Shapes in statement order.
   */
  private statementsEvaluate(
    statements: ScadStatement[],
    parent: ScadScope,
    context: ScadContext,
    scope = new ScadScope(parent),
  ): ScadShape[] {
    for (const statement of statements) this.definitionApply(statement, scope);
    return statements.flatMap((statement) => this.statementEvaluate(statement, scope, context));
  }

  /**
   * Registers a definition or assignment in a scope.
   *
   * @param statement Statement.
   * @param scope Scope.
   */
  private definitionApply(statement: ScadStatement, scope: ScadScope): void {
    if (statement.kind === 'module_define')
      scope.moduleSet(statement.name, { params: statement.params, body: statement.body, scope });
    if (statement.kind === 'function_define')
      scope.functionSet(statement.name, { params: statement.params, body: statement.body, scope });
    if (statement.kind === 'assign')
      scope.variableSet(statement.name, this.expressions.evaluate(statement.value, scope));
  }

  /**
   * Evaluates one shape-producing statement.
   *
   * @param statement Statement.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private statementEvaluate(statement: ScadStatement, scope: ScadScope, context: ScadContext): ScadShape[] {
    try {
      switch (statement.kind) {
        case 'block':
          return this.statementsEvaluate(statement.body, scope, context);
        case 'if':
          return this.ifEvaluate(statement, scope, context);
        case 'for':
          return this.forEvaluate(statement, scope, context);
        case 'module_call':
          return this.callEvaluate(statement, scope, context);
        default:
          return [];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message.startsWith('line ') ? message : `line ${statement.line}: ${message}`);
    }
  }

  /**
   * Evaluates the branch an if statement picks.
   *
   * @param statement If statement.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private ifEvaluate(
    statement: Extract<ScadStatement, { kind: 'if' }>,
    scope: ScadScope,
    context: ScadContext,
  ): ScadShape[] {
    const truthy = scadValueTruthy(this.expressions.evaluate(statement.condition, scope));
    return this.statementsEvaluate(truthy ? statement.then : statement.otherwise, scope, context);
  }

  /**
   * Evaluates a for statement into one implicit union.
   *
   * @param statement For statement.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private forEvaluate(
    statement: Extract<ScadStatement, { kind: 'for' }>,
    scope: ScadScope,
    context: ScadContext,
  ): ScadShape[] {
    const shapes = this.expressions.bindingsWalk(statement.bindings, scope, (inner) =>
      this.statementsEvaluate(statement.body, inner, context),
    );
    const joined = scadShapeJoin(shapes, scope.moduleName || 'for');
    return joined ? [joined] : [];
  }

  /**
   * Evaluates a module call: user module, transform, boolean or primitive.
   *
   * @param call Module call.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private callEvaluate(
    call: Extract<ScadStatement, { kind: 'module_call' }>,
    scope: ScadScope,
    context: ScadContext,
  ): ScadShape[] {
    const user = scope.moduleGet(call.name);
    if (user) return this.userModuleEvaluate(call, user, scope, context);
    if (call.name === 'children') return this.childrenEvaluate(call.args, scope, context);
    const args = this.argumentsResolve(call.name, call.args, scope);
    const inner = this.specialsScope(call.args, args, scope);
    const matrix = scadTransformMatrix(call.name, args);
    if (matrix)
      return this.statementsEvaluate(call.children, inner, {
        ...context,
        matrix: context.matrix.clone().multiply(matrix),
      });
    return this.builtinEvaluate(call, args, inner, context);
  }

  /**
   * Evaluates built-in modules other than transforms.
   *
   * @param call Module call.
   * @param args Resolved arguments.
   * @param scope Scope holding $ overrides of the call.
   * @param context Transform context.
   * @returns Shapes.
   */
  private builtinEvaluate(
    call: Extract<ScadStatement, { kind: 'module_call' }>,
    args: ScadCallArguments,
    scope: ScadScope,
    context: ScadContext,
  ): ScadShape[] {
    const name = call.name;
    if (name === 'color' || name === 'render' || name === 'group')
      return this.statementsEvaluate(call.children, scope, context);
    if (name === 'union' || name === 'difference' || name === 'intersection')
      return this.booleanEvaluate(name, call.children, scope, context);
    if (name === 'hull') return this.hullEvaluate(call.children, scope, context);
    if (name === 'linear_extrude') return this.extrudeEvaluate(call.children, args, scope, context);
    if (name === 'echo') return this.echoEvaluate(call.args, scope);
    if (name === 'assert') return this.assertEvaluate(args);
    const hint = SCAD_UNSUPPORTED[name];
    if (hint) throw new Error(`${name}() is not supported: ${hint}`);
    if (call.children.length > 0) throw new Error(`${name}() takes no children; is a ";" missing after it?`);
    return this.primitiveEvaluate(name, args, scope, context);
  }

  /**
   * Evaluates a primitive shape.
   *
   * @param name Module name.
   * @param args Resolved arguments.
   * @param scope Scope.
   * @param context Transform context.
   * @returns One shape.
   */
  private primitiveEvaluate(
    name: string,
    args: ScadCallArguments,
    scope: ScadScope,
    context: ScadContext,
  ): ScadShape[] {
    const label = scope.moduleName || name;
    const planar = name === 'square' || name === 'circle' || name === 'polygon';
    if (planar !== context.planar) {
      throw new Error(`${name}() is ${planar ? '2D and must be inside' : '3D and cannot be inside'} linear_extrude()`);
    }
    if (planar) return [this.planarShape(name, args, scope, context, label)];
    const build = SCAD_SOLID_PRIMITIVES[name];
    if (!build) throw new Error(`unknown module ${name}()`);
    const points = build(args, this.fragmentSettings(scope));
    this.solidCount();
    return [{ kind: 'solid', label, points: points.map((point) => point.applyMatrix4(context.matrix)) }];
  }

  /**
   * Builds a 2D primitive; polygon holes become a difference.
   *
   * @param name Module name.
   * @param args Resolved arguments.
   * @param scope Scope.
   * @param context Transform context.
   * @param label Shape label.
   * @returns Shape.
   */
  private planarShape(
    name: string,
    args: ScadCallArguments,
    scope: ScadScope,
    context: ScadContext,
    label: string,
  ): ScadShape {
    this.solidCount();
    const outlines =
      name === 'square'
        ? [scadSquarePoints(args)]
        : name === 'circle'
          ? [scadCirclePoints(scadRadius(args, 'r', 'd', args.number('r', 0, 1)), this.fragmentSettings(scope))]
          : scadPolygonPaths(args);
    const shapes: ScadShape[] = outlines.map((outline) => ({
      kind: 'polygon',
      label,
      points: outline.map((point) => this.planarTransform(point, context.matrix)),
    }));
    return shapes.length === 1
      ? (shapes[0] as ScadShape)
      : { kind: 'boolean', operation: 'difference', children: shapes, label };
  }

  /**
   * Applies a matrix to a 2D point in the XY plane.
   *
   * @param point Point.
   * @param matrix Matrix.
   * @returns Transformed point.
   */
  private planarTransform(point: ScadPoint2, matrix: THREE.Matrix4): ScadPoint2 {
    const moved = new THREE.Vector3(point[0], point[1], 0).applyMatrix4(matrix);
    return [moved.x, moved.y];
  }

  /**
   * Evaluates union, difference or intersection; each child statement is one
   * operand.
   *
   * @param operation Boolean operation.
   * @param children Child statements.
   * @param scope Scope.
   * @param context Transform context.
   * @returns One boolean shape, or nothing when empty.
   */
  private booleanEvaluate(
    operation: 'union' | 'difference' | 'intersection',
    children: ScadStatement[],
    scope: ScadScope,
    context: ScadContext,
  ): ScadShape[] {
    const inner = new ScadScope(scope);
    for (const statement of children) this.definitionApply(statement, inner);
    const operands = children.flatMap((statement) => {
      const joined = scadShapeJoin(this.statementEvaluate(statement, inner, context), scope.moduleName || operation);
      return joined ? [joined] : [];
    });
    if (operands.length === 0) return [];
    if (operands.length === 1 && operation !== 'difference') return operands;
    return [{ kind: 'boolean', operation, children: operands, label: scope.moduleName || operation }];
  }

  /**
   * Evaluates hull() into one convex solid or polygon.
   *
   * @param children Child statements.
   * @param scope Scope.
   * @param context Transform context.
   * @returns One shape, or nothing when empty.
   */
  private hullEvaluate(children: ScadStatement[], scope: ScadScope, context: ScadContext): ScadShape[] {
    const leaves = this.statementsEvaluate(children, scope, context).flatMap(scadShapeLeavesPositive);
    if (leaves.length === 0) return [];
    const label = scope.moduleName || 'hull';
    if (context.planar)
      return [
        {
          kind: 'polygon',
          label,
          points: scadPolygonHull(leaves.flatMap((leaf) => (leaf.kind === 'polygon' ? leaf.points : []))),
        },
      ];
    return [{ kind: 'solid', label, points: leaves.flatMap((leaf) => (leaf.kind === 'solid' ? leaf.points : [])) }];
  }

  /**
   * Evaluates linear_extrude() of 2D children.
   *
   * @param children Child statements.
   * @param args Resolved arguments.
   * @param scope Scope.
   * @param context Transform context.
   * @returns Extruded shapes.
   */
  private extrudeEvaluate(
    children: ScadStatement[],
    args: ScadCallArguments,
    scope: ScadScope,
    context: ScadContext,
  ): ScadShape[] {
    if (context.planar) throw new Error('linear_extrude() cannot be nested');
    const planar = scadShapeJoin(
      this.statementsEvaluate(children, scope, { matrix: new THREE.Matrix4(), planar: true }),
      scope.moduleName || 'linear_extrude',
    );
    return planar ? [scadExtrude(planar, args, context.matrix)] : [];
  }

  /**
   * Calls a user module with its children.
   *
   * @param call Module call.
   * @param definition Module definition.
   * @param scope Calling scope.
   * @param context Transform context.
   * @returns Shapes.
   */
  private userModuleEvaluate(
    call: Extract<ScadStatement, { kind: 'module_call' }>,
    definition: NonNullable<ReturnType<ScadScope['moduleGet']>>,
    scope: ScadScope,
    context: ScadContext,
  ): ScadShape[] {
    const inner = new ScadScope(definition.scope, { statements: call.children, scope }, call.name);
    this.expressions.argumentsBind(definition.params, call.args, scope, definition.scope, inner);
    const joined = scadShapeJoin(
      this.statementsEvaluate(definition.body, inner, context, new ScadScope(inner)),
      call.name,
    );
    return joined ? [joined] : [];
  }

  /**
   * Evaluates children() or children(index) inside a user module.
   *
   * @param args Call arguments.
   * @param scope Scope inside the module.
   * @param context Transform context.
   * @returns Shapes.
   */
  private childrenEvaluate(args: ScadArgument[], scope: ScadScope, context: ScadContext): ScadShape[] {
    const children = scope.children;
    if (!children) return [];
    const index = args[0] ? scadValueNumber(this.expressions.evaluate(args[0].value, scope)) : undefined;
    const statements =
      index === undefined
        ? children.statements
        : children.statements.filter((statement) => statement.kind !== 'assign').slice(index, index + 1);
    return this.statementsEvaluate(statements, children.scope, context);
  }

  /**
   * Records an echo() message.
   *
   * @param args Call arguments.
   * @param scope Scope.
   * @returns No shapes.
   */
  private echoEvaluate(args: ScadArgument[], scope: ScadScope): ScadShape[] {
    const parts = args.map((arg) => {
      const value = this.expressions.evaluate(arg.value, scope);
      return arg.name ? `${arg.name} = ${scadValueText(value)}` : scadValueText(value);
    });
    this.messages.push(`ECHO: ${parts.join(', ')}`);
    return [];
  }

  /**
   * Checks an assert() condition.
   *
   * @param args Resolved arguments.
   * @returns No shapes.
   */
  private assertEvaluate(args: ScadCallArguments): ScadShape[] {
    if (!scadValueTruthy(args.value('condition', 0)))
      throw new Error(`assertion failed: ${scadValueText(args.value('message', 1) ?? 'condition is false')}`);
    return [];
  }

  /**
   * Evaluates the arguments of a built-in module.
   *
   * @param name Module name.
   * @param args Call arguments.
   * @param scope Scope.
   * @returns Argument view.
   */
  private argumentsResolve(name: string, args: ScadArgument[], scope: ScadScope): ScadCallArguments {
    const positional: ScadValue[] = [];
    const named = new Map<string, ScadValue>();
    for (const arg of args) {
      const value = this.expressions.evaluate(arg.value, scope);
      if (arg.name) named.set(arg.name, value);
      else positional.push(value);
    }
    return new ScadCallArguments(name, positional, named);
  }

  /**
   * Returns a scope carrying the $ variables a call overrides.
   *
   * @param raw Call arguments.
   * @param args Resolved arguments.
   * @param scope Calling scope.
   * @returns Scope.
   */
  private specialsScope(raw: ScadArgument[], args: ScadCallArguments, scope: ScadScope): ScadScope {
    const specials = raw.filter((arg) => arg.name?.startsWith('$'));
    if (specials.length === 0) return scope;
    const inner = new ScadScope(scope);
    for (const arg of specials) inner.variableSet(arg.name as string, args.value(arg.name as string));
    return inner;
  }

  /**
   * Reads $fn, $fa and $fs.
   *
   * @param scope Scope.
   * @returns Resolution settings.
   */
  private fragmentSettings(scope: ScadScope): ScadFragmentSettings {
    return {
      fn: scadValueNumber(scope.variableGet('$fn')) ?? 0,
      fa: Math.max(0.01, scadValueNumber(scope.variableGet('$fa')) ?? 12),
      fs: Math.max(0.01, scadValueNumber(scope.variableGet('$fs')) ?? 2),
    };
  }

  /** Counts one more solid and stops runaway programs. */
  private solidCount(): void {
    this.solids += 1;
    if (this.solids > SCAD_SOLIDS_MAX) throw new Error(`more than ${SCAD_SOLIDS_MAX} solids; simplify the model`);
  }
}
