import { solidScriptEachUsed } from './solid_script_each_uses.js';
import { solidScriptShapesNotConvex } from './solid_script_solid_validate.js';
import {
  SOLID_SCRIPT_USE_GENERATOR,
  solidScriptInputBrushName,
  type SolidScriptSystemReader,
} from './solid_script_system.js';
import { solidScriptKindAccepted, solidScriptKindMismatch, solidScriptKindOf } from './solid_script_kinds.js';
import * as THREE from 'three';
import { solidScriptMistakeHinted } from './solid_script_field_mistakes.js';
import { SolidScriptBlockArguments } from './solid_script_block_arguments.js';
import type { SolidScriptBlockNode } from './solid_script_block_tree.js';
import { solidScriptFailure, solidScriptFailureKeep } from './solid_script_error.js';
import {
  solidScriptFieldAsTyped,
  solidScriptFieldArguments,
  solidScriptFieldList,
  solidScriptFieldResolve,
  solidScriptFieldSplit,
} from './solid_script_field.js';
import { solidScriptExtrude } from './solid_script_extrude.js';
import { solidScriptHullShapes } from './solid_script_hull.js';
import {
  solidScriptMachineFlatCheck,
  solidScriptMachineGatherCheck,
  solidScriptMachineGatherWhile,
} from './solid_script_machine_gather.js';
import { type SolidScriptPoint2 } from './solid_script_polygon.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptShapeTransform } from './solid_script_reshape.js';
import { solidScriptUseFaceUvs } from './solid_script_uvs.js';
import { solidScriptMeshChecked, solidScriptMeshTransform } from './solid_script_mesh.js';
import { SolidScriptScope } from './solid_script_scope.js';
import { solidScriptIntoAssigned } from './solid_script_into_assigned.js';
import { solidScriptIntoCopyName } from './solid_script_into.js';
import { solidScriptScopeElementBind } from './solid_script_scope_element.js';
import {
  SOLID_SCRIPT_GROUP_MODE_DEFAULT,
  SOLID_SCRIPT_MODE_DEFAULT,
  solidScriptGroupModeOf,
  solidScriptModeApply,
  solidScriptSolidMade,
  type SolidScriptMode,
} from './solid_script_mode.js';
import { solidScriptModeRoleOfUse, solidScriptModeRoleRemember } from './solid_script_mode_role.js';
import {
  solidScriptLineFieldOf,
  solidScriptLinesPassInput,
  solidScriptRunKnown,
  solidScriptRunMake,
  solidScriptRunsKnown,
  type SolidScriptBlockRuns,
  type SolidScriptLineField,
  type SolidScriptLineRun,
  type SolidScriptLineState,
  type SolidScriptRunBuild,
} from './solid_script_machine_runs.js';
import { solidScriptGeometryLeaves, type SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { SolidScriptOutputProcessed } from './solid_script_output_processed.js';
import { SolidScriptPaths, solidScriptPathFromFlat } from './solid_script_paths.js';
import { solidScriptPathFlat, solidScriptPathLoopOpen } from './solid_script_path_flat.js';
import { solidScriptPathStraight } from './solid_script_path_model.js';
import { solidScriptGeneratorPiecesCacheClear } from './solid_script_generator_pieces.js';
import { solidScriptBodyHull, type SolidScriptBody } from './solid_script_body.js';
import {
  solidScriptShapeJoin,
  solidScriptShapeNamed,
  solidScriptShapeMapLeaves,
  type SolidScriptFaceUv,
  type SolidScriptShape,
  type SolidScriptShapePolygon,
  type SolidScriptShapeSolid,
  SOLID_SCRIPT_SHAPE_NAME_KEY,
  solidScriptShapeLeavesPositive,
  solidScriptShapesNamed,
  solidScriptLeafRewritten,
  solidScriptShapePolygon,
} from './solid_script_shape.js';
import { SolidScriptElement, solidScriptValueText, type SolidScriptValue } from './solid_script_value.js';
import { SOLID_SCRIPT_HANDLERS, SolidScriptMachineCalls } from './solid_script_machine_calls.js';
import type {
  SolidScriptBlockRun,
  SolidScriptBreak,
  SolidScriptBreakpoints,
  SolidScriptContext,
  SolidScriptEvent,
  SolidScriptFrameView,
  SolidScriptGathering,
  SolidScriptHandled,
  SolidScriptFrame,
  SolidScriptLineProfile,
  SolidScriptLineSeen,
  SolidScriptMachineCommand,
  SolidScriptMachineField,
  SolidScriptRun,
  SolidScriptVariable,
  SolidScriptWarning,
} from './solid_script_machine_types.js';
import { SOLID_SCRIPT_SYSTEM_CATALOG } from './solid_script_system_names.js';
import {
  SOLID_SCRIPT_LOCAL_PREFIX,
  solidScriptPersistentRead,
  solidScriptVariableView,
} from './solid_script_machine_variables.js';
import { SOLID_SCRIPT_LIMITS, SOLID_SCRIPT_WORK_LIMIT, solidScriptLimitCount } from './solid_script_limits.js';

/**
 * Most steps of work one run may take: lines, loop rounds and function calls.
 * Counting work instead of time keeps every machine of a room in step. The cap
 * lives in the shared limits table.
 */
export { SOLID_SCRIPT_WORK_LIMIT } from './solid_script_limits.js';

/**
 * Most variable values a profiling run keeps for what each line saw before it
 * ran; past it, a line that runs again keeps nothing, so a long loop does not
 * slow the run down.
 */
export const SOLID_SCRIPT_SEEN_LIMIT = 250_000;

/**
 * Runs the lines of a script directly, one block after the other. A machine
 * runs one script once: every run makes a new machine, so no variable, counter,
 * part or mistake carries over to the next run or another generator.
 */
export class SolidScriptMachine<Command extends SolidScriptMachineCommand> extends SolidScriptMachineCalls<Command> {
  private readonly messages: string[] = [];
  /**
   * System lists such as [$Selected.Faces] where the run paused or reached its
   * step limit, or null to read them where the run ends.
   */
  private systemSeen: SolidScriptVariable[] | null = null;
  /**
   * 1-based lines that ran up to the last step within the limit, when
   * profiling.
   */
  private passedSeen: number[] | null = null;
  /** True from the last step within the limit until its line finishes. */
  private systemPending = false;
  /** The stack as it was at the watched step. */
  private stackSeen: SolidScriptFrameView[] = [];
  private readonly notices: string[] = [];
  private solids = 0;
  protected readonly processed = new SolidScriptOutputProcessed();
  /** True once a line has read the received brushes, not only the debugger. */
  private incomingUsed = false;
  /** True while system lists are being copied for the debugger. */
  private capturingSystem = false;
  private work = 0;
  private used = false;
  private readonly breaks: SolidScriptBreak[] = [];
  /**
   * Received brushes as they arrived, made on first use, and kept after Input
   * Brushes.
   */
  private incoming: SolidScriptGeometryLeaf[] | null = null;
  /** Received brushes, made on first use, until Input Objects builds them. */
  private received: SolidScriptGeometryLeaf[] | null = null;
  /** What each swapped solid or mesh became. */
  private readonly leafSwaps = new Map<SolidScriptGeometryLeaf, SolidScriptGeometryLeaf>();
  /** Paths of the run: written by Path lines, or drawn for a block to fill. */
  private readonly paths = new SolidScriptPaths();
  /** How many Group or Part blocks are around the running line. */
  private groupDepth = 0;
  /**
   * Points being gathered by the Polyhedron or Polygon blocks around the
   * running line, innermost last.
   */
  private readonly gathering: SolidScriptGathering[] = [];
  /** True from a Stop Script line until the run or event ends. */
  private stopping = false;
  private watched: SolidScriptScope | null = null;
  /**
   * Variables of the last step within the step limit as they were then, since
   * the run goes on past it; null to read the watched scope where the run
   * ends.
   */
  private watchedValues: Map<string, SolidScriptValue> | null = null;
  /** Count and time of each line, when profiling. */
  private readonly profile = new Map<number, SolidScriptLineProfile>();
  /** Lines being timed now, so a line that calls itself is timed once. */
  private readonly profiled = new Set<number>();
  /**
   * Variables and running frames with their own variables just before each
   * 1-based line last ran, when profiling, turned into text when the run ends;
   * null for a line that ran again once too many values were kept.
   */
  private readonly lineSeen = new Map<
    number,
    {
      variables: Map<string, SolidScriptValue>;
      stack: { frame: SolidScriptFrame; locals: Map<string, SolidScriptValue> }[];
    } | null
  >();
  /** Values kept in lineSeen so far, up to SOLID_SCRIPT_SEEN_LIMIT. */
  private lineSeenValues = 0;

  /**
   * Creates a machine.
   *
   * @param stepLimit Shapes to build; later shapes are only counted.
   * @param breakpoints Lines to record or pause at, or null.
   * @param inputs Inspector values of the script's Input lines, by name.
   * @param system Built-in values.
   * @param profiling True to count and time every line.
   */
  constructor(
    private readonly stepLimit = Number.POSITIVE_INFINITY,
    private readonly breakpoints: SolidScriptBreakpoints | null = null,
    inputs: Readonly<Record<string, string>> = {},
    system: SolidScriptSystemReader = { get: () => undefined },
    private readonly profiling = false,
  ) {
    super(inputs, system);
  }

  /**
   * Lists the brushes a modifier receives, as [$Input.Objects]: those the Input
   * Brushes line built, else the received brushes as they came.
   *
   * @returns Brush elements, none for a generator.
   */
  protected brushesReceived(): SolidScriptValue[] {
    if (!this.capturingSystem) this.incomingUsed = true;
    if (this.received) return this.received.map((leaf) => this.elements.brush(leaf));
    this.incoming ??= this.incomingSolids();
    this.received = this.incoming;
    return this.incoming.map((leaf) => this.elements.brush(leaf));
  }

  /**
   * Builds the received solids as they arrived, with each brush's scene Mode.
   *
   * @returns Solids, none for a generator.
   */
  private incomingSolids(): SolidScriptGeometryLeaf[] {
    const use = this.system.use;
    return (use?.solids ?? []).map((solid, index) => {
      const mode = use?.modes?.[index];
      const faceUvs = solidScriptUseFaceUvs(use?.textures?.[index]);
      const leaf: SolidScriptGeometryLeaf = {
        kind: 'solid',
        label: solidScriptInputBrushName(index),
        points: solid.corners.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
        faces: solid.faces.map((loop) => [...loop]),
        ...(mode ? { mode } : {}),
        ...(faceUvs ? { faceUvs } : {}),
      };
      this.elements.modeRoleSet(leaf, mode ?? SOLID_SCRIPT_MODE_DEFAULT);
      return leaf;
    });
  }

  /** Latest incoming solids or meshes, after Clip and other writes. */
  protected receivedLatest(): SolidScriptGeometryLeaf[] {
    this.brushesReceived();
    return (this.incoming ?? []).map((leaf) => this.leafLatestOf(leaf));
  }

  /**
   * Latest Mode of each received brush, including Set after Input Objects.
   *
   * @returns Mode of each received brush, or unset when that brush has none.
   */
  protected receivedModes(): readonly SolidScriptShapeSolid['mode'][] {
    this.brushesReceived();
    return (this.received ?? []).map((leaf) => {
      const latest = this.leafLatestOf(leaf);
      return latest.kind === 'solid' ? latest.mode : undefined;
    });
  }

  /**
   * Returns what a solid or mesh became after the swaps since it was read.
   *
   * @param leaf Solid or mesh.
   * @returns Latest version.
   */
  protected leafSwapsLatest(leaf: SolidScriptGeometryLeaf): SolidScriptGeometryLeaf {
    let latest = leaf;
    for (let next = this.leafSwaps.get(latest); next; next = this.leafSwaps.get(latest)) latest = next;
    return latest;
  }

  /**
   * Returns what a solid or mesh became after the swaps since it was read,
   * including the edited copy of an Into tool.
   *
   * @param leaf Solid or mesh.
   * @returns Latest version.
   */
  protected leafLatestOf(leaf: SolidScriptGeometryLeaf): SolidScriptGeometryLeaf {
    let latest = this.leafSwapsLatest(leaf);
    for (;;) {
      const next = this.toolCopy.of(latest);
      if (!next) return this.leafSwapsLatest(latest);
      latest = next;
    }
  }

  /**
   * Returns what a solid or mesh became after later writes.
   *
   * @param leaf Solid or mesh.
   * @returns Latest version.
   */
  protected leafLatest(leaf: SolidScriptGeometryLeaf): SolidScriptGeometryLeaf {
    return this.leafLatestOf(leaf);
  }

  /**
   * Shapes with each solid or mesh replaced by the version later writes left.
   *
   * @param shapes Shapes as they were first stored.
   * @returns Shapes carrying the latest leaves.
   */
  private shapesLatest(shapes: readonly SolidScriptShape[]): SolidScriptShape[] {
    return shapes.map((shape) =>
      solidScriptShapeMapLeaves(shape, (leaf) => (leaf.kind === 'polygon' ? leaf : this.leafLatestOf(leaf))),
    );
  }

  /**
   * Records a later version of a solid or mesh so later reads and the result
   * use it.
   *
   * @param leaf Solid or mesh to replace.
   * @param found Replacement.
   */
  protected leafRewrite(leaf: SolidScriptGeometryLeaf, found: SolidScriptGeometryLeaf): void {
    const by = solidScriptLeafRewritten(leaf, found);
    this.elements.modeRoleCopy(leaf, by);
    if (this.toolCopy.take(leaf, by)) {
      this.processed.note(by);
      return;
    }
    this.elements.brushRemember(leaf, by);
    this.leafSwaps.set(leaf, by);
    this.elements.follow(leaf, by);
    this.partLeavesRewrite(leaf, by);
  }

  /** Marks that a Group or Part now wraps the running lines. */
  protected groupEnter(): void {
    this.groupDepth += 1;
  }

  /** Marks that a Group or Part around the running lines has closed. */
  protected groupLeave(): void {
    this.groupDepth -= 1;
  }

  /**
   * Records the inherited Mode of newly placed solids and returns them.
   *
   * @param shapes Shapes just created or stamped.
   * @returns The same shapes.
   */
  protected modeRolePlaced(shapes: SolidScriptShape[]): SolidScriptShape[] {
    solidScriptModeRoleRemember(shapes, this.modeRoleCurrent(), (leaf, role) => this.elements.modeRoleSet(leaf, role));
    return shapes;
  }

  /**
   * Insertion Mode a solid inherits at the current depth: Additive inside a
   * Group or Part, otherwise the run's insertion Mode.
   *
   * @returns Inherited Mode.
   */
  protected modeRoleCurrent(): SolidScriptMode {
    return this.groupDepth > 0 ? SOLID_SCRIPT_MODE_DEFAULT : solidScriptModeRoleOfUse(this.system.use);
  }

  /**
   * Reads the Of field of a line as one flat list of values: brushes, faces,
   * edges or corners, with Name tags read as the brushes that have them.
   *
   * @param node Line.
   * @param value Reads a field of the line.
   * @returns Values, or null when the line has no Of or it is empty.
   */
  private ofRead(
    node: SolidScriptBlockNode<Command>,
    value: (key: string) => SolidScriptValue,
  ): SolidScriptValue[] | null {
    const field = node.command.parameters.find((parameter) => parameter.key === 'of');
    if (!field || (node.values['of'] ?? '').trim() === '') return null;
    const flat = (entry: SolidScriptValue): SolidScriptValue[] =>
      Array.isArray(entry) && solidScriptKindOf(entry) !== 'Vector' ? entry.flatMap(flat) : [entry];
    return flat(value('of')).flatMap((entry) => this.ofEntry(field, entry));
  }

  /**
   * Reads one value of an Of field: an element as it is, a value that is not
   * text as it is, a name as the brushes, or else the flat outlines, that have
   * it, and any other kind stops with what the field takes.
   *
   * @param field The Of field, with the kinds it accepts.
   * @param entry Value.
   * @returns Elements.
   */
  private ofEntry(field: SolidScriptMachineField, entry: SolidScriptValue): SolidScriptValue[] {
    const kind = solidScriptKindOf(entry);
    if (!solidScriptKindAccepted(field.accepts, kind))
      throw new Error(`${solidScriptKindMismatch(field.label, field.accepts, kind)}: ${solidScriptValueText(entry)}`);
    if (entry instanceof SolidScriptElement) return [entry];
    if (kind !== 'Text') return [entry];
    const name = solidScriptValueText(entry).trim();
    if (name === '') return [];
    this.brushesReceived();
    const built = [
      ...this.shapesLatest(this.builtStack.flat()),
      ...(this.received ?? []).map((leaf) => this.leafLatestOf(leaf)),
    ];
    const named = solidScriptShapesNamed(built, name);
    // Open outlines win where the line takes them: inside an extrude, a Name
    // means the outline being drawn, not a finished brush that kept the Name.
    if (field.paths === true && this.outlinesOf(named).length > 0) return this.ofOutlines(field, name, named);
    const leaves = solidScriptGeometryLeaves(named);
    if (leaves.length > 0) return leaves.map((leaf) => this.elements.brush(leaf));
    return this.ofOutlines(field, name, named);
  }

  /**
   * Lists the flat outlines among shapes.
   *
   * @param shapes Shapes.
   * @returns Outlines.
   */
  private outlinesOf(shapes: readonly SolidScriptShape[]): SolidScriptShapePolygon[] {
    return shapes
      .flatMap(solidScriptShapeLeavesPositive)
      .filter((leaf): leaf is SolidScriptShapePolygon => leaf.kind === 'polygon');
  }

  /**
   * Reads the flat outlines among the shapes with a Name, as an Of field gets
   * them.
   *
   * @param field The Of field, which tells whether it takes outlines.
   * @param name Name.
   * @param named Shapes with that Name.
   * @returns Outline elements.
   */
  private ofOutlines(
    field: SolidScriptMachineField,
    name: string,
    named: readonly SolidScriptShape[],
  ): SolidScriptValue[] {
    const outlines = this.outlinesOf(named);
    if (outlines.length === 0) throw new Error(`No object or path above is named "${name}"; give one a Name first`);
    if (field.paths !== true) throw new Error(`"${name}" is a Path, and this line works on objects`);
    return outlines.map((outline) => this.paths.element(outline));
  }

  /**
   * Name in a line's copy-style Into field, or empty when the result stays in
   * the current output. Label-style fields are ignored.
   *
   * @param node Line and command.
   * @returns Variable name, or empty.
   */
  private intoName(node: SolidScriptBlockNode<Command>): string {
    return solidScriptIntoCopyName(node.command.parameters, (key) => node.command.valueText(node.values, key));
  }

  /**
   * Writes what a building block built Into its variable.
   *
   * @param node Line.
   * @param scope Scope of the line.
   * @param shapes What it built.
   */
  private builtNote(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    shapes: readonly SolidScriptShape[],
  ): void {
    if (this.failure) return;
    const into = this.intoName(node);
    if (into === '') return;
    const brushes = solidScriptGeometryLeaves([...shapes]).map((leaf) => this.elements.brush(leaf));
    this.variableSet(scope, into, solidScriptIntoAssigned(node.command.intoList === true, brushes));
  }

  /**
   * Shapes a line adds to the current output: none when a copy-style Into is
   * set, so the result lives only in that variable until Output places it.
   *
   * @param node Line and command.
   * @param shapes What the line built or edited.
   * @returns Shapes for the current output.
   */
  private intoShapes(node: SolidScriptBlockNode<Command>, shapes: SolidScriptShape[]): SolidScriptShape[] {
    if (shapes.length === 0) return shapes;
    return this.intoName(node) === '' ? shapes : [];
  }

  /**
   * Runs a script once, from the top. Function and event handler blocks are
   * skipped to their End; their lines run when they are called. A Part builds
   * into a variable of the same name and outputs nothing where it stands.
   *
   * @param lines Top-level lines.
   * @returns Shapes, output, steps and the first mistake.
   */
  run(lines: SolidScriptBlockNode<Command>[]): Omit<SolidScriptRun, 'ms'> {
    solidScriptGeneratorPiecesCacheClear();
    this.useOnce();
    this.scriptLines = lines;
    const context = { matrix: new THREE.Matrix4(), planar: false };
    if (this.stepLimit === 0) {
      this.systemSeen = this.systemCapture();
      this.passedSeen = [];
    }
    const shapes = this.shapesLatest(this.linesRun(lines, this.root, context, this.root));
    this.stopping = false;
    // Where the run ended, the top lines' shapes count as built so far.
    this.builtStack.push(shapes);
    const system = this.systemSeen ?? this.systemCapture();
    this.builtStack.pop();
    const variables = [...(this.watchedValues ?? this.watched?.variablesVisible() ?? [])].map(([name, value]) =>
      solidScriptVariableView(this.spellings.get(name) ?? name, value),
    );
    const warnings: SolidScriptWarning[] = [...this.warnings]
      .sort(([left], [right]) => left - right)
      .map(([line, text]) => ({ line, text }));
    if (
      !this.failure &&
      !this.paused &&
      shapes.length === 0 &&
      this.system.use?.usage !== 'Modifier' &&
      !solidScriptLinesPassInput(lines)
    )
      warnings.push({
        line: null,
        text: 'The script builds no objects; add one such as Cube, or Output a variable.',
      });
    const bent = this.failure || this.paused ? 0 : solidScriptShapesNotConvex(shapes);
    if (bent > 0)
      warnings.push({
        line: null,
        text: `${bent === 1 ? '1 solid is' : `${bent} solids are`} not convex and will not be built; move the corners until every solid is convex, or use Mesh From Solids.`,
      });
    if (this.incomingUsed && this.incoming && this.received === this.incoming) this.processed.notes(this.incoming);
    return {
      shapes,
      messages: this.messages,
      warnings,
      steps: this.steps,
      variables,
      breaks: this.breaks,
      paused: this.paused,
      stack: this.stackSeen,
      system,
      passed: this.passedSeen ?? [...this.profile.keys()],
      profile: this.profile,
      seen: this.lineSeenViews(),
      processedSolids: this.processed.solids,
      processedMeshes: this.processed.meshes,
      error: this.failure,
    };
  }

  /**
   * Runs the handler blocks of an inspector event instead of the script: a
   * fresh run where only the Input lines and the matching When Input Changes or
   * When Button Pressed blocks run, so values can be checked, clamped with Set
   * Input and explained with Show Message without building anything.
   *
   * @param lines Top-level lines.
   * @param event Event that happened.
   * @returns Changed inputs, messages and the first mistake.
   */
  handle(lines: SolidScriptBlockNode<Command>[], event: SolidScriptEvent): SolidScriptHandled {
    this.useOnce();
    this.scriptLines = lines;
    this.handling = true;
    const context = { matrix: new THREE.Matrix4(), planar: false };
    this.definitionsRegister(lines);
    for (const node of lines) if (node.command.id === 'input') this.lineRun(node, this.root, context);
    const id = SOLID_SCRIPT_HANDLERS[event.kind];
    for (const handler of this.handlers) {
      if (handler.command.id !== id) continue;
      if (event.kind !== 'bake' && handler.command.valueText(handler.values, 'name').trim() !== event.name) continue;
      if (handler.children.length > 0) this.linesRun(handler.children, this.root, context);
      this.stopping = false;
      if (this.steps.length > 0 && !this.failure)
        this.failure = solidScriptFailure(
          this.steps[0] ?? handler.line,
          `line ${this.steps[0] ?? handler.line}: ${handler.command.label} blocks only check and change inputs; objects are built by the script from the top`,
        );
    }
    return {
      inputs: this.inputsChanged,
      removed: [...this.inputsRemoved],
      notices: this.notices,
      messages: this.messages,
      error: this.failure,
    };
  }

  /** Marks the machine used; a machine runs once. */
  private useOnce(): void {
    if (this.used) throw new Error('a script machine runs once; make a new one for every run');
    this.used = true;
    for (const [name, value] of solidScriptPersistentRead(this.inputs))
      this.persistent.variableDefine(this.nameKey(name), value);
  }

  /**
   * Runs lines one after the other in a new scope. Parts defined among them are
   * known to all of them, and each Part is also stored as a variable.
   *
   * @param lines Lines.
   * @param parent Enclosing scope.
   * @param context Matrix and flatness.
   * @param scope Scope to run in; a new child of the parent by default.
   * @param known Kept run views of the lines.
   * @returns Shapes in line order.
   */
  protected linesRun(
    lines: readonly SolidScriptBlockNode<Command>[],
    parent: SolidScriptScope,
    context: SolidScriptContext,
    scope = new SolidScriptScope(parent),
    known = solidScriptRunsKnown(lines, SolidScriptMachine.build),
  ): SolidScriptShape[] {
    const { runs } = known;
    this.definitionsRegister(lines);
    const built: SolidScriptShape[] = [];
    this.builtStack.push(built);
    try {
      for (let index = 0; index < lines.length; index++) {
        const shapes = this.lineRun(lines[index]!, scope, context, runs[index]!);
        for (const shape of shapes) built.push(shape);
        if (this.systemPending) {
          // The last step shown is built: its line reads the lists as they are now.
          this.systemPending = false;
          this.systemSeen = this.systemCapture();
          this.passedSeen = [...this.profile.keys()];
        }
      }
    } finally {
      this.builtStack.pop();
    }
    return built;
  }

  /**
   * Runs one line unless the run already stopped.
   *
   * @param node Line.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @param known Kept run view of the line.
   * @returns Shapes.
   */
  private lineRun(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
    known = solidScriptRunKnown(node, SolidScriptMachine.build),
  ): SolidScriptShape[] {
    if (known.definition) return [];
    if (this.profiling) this.lineSeenNote(node.line, scope);
    if (this.breakReached(node.line, scope)) return [];
    if (this.profiling) return this.lineProfiled(node, scope, context, known);
    return this.lineExecute(node, scope, context, known);
  }

  /**
   * Runs one line that is not a definition and not paused at.
   *
   * @param node Line.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @param known Kept run view of the line.
   * @returns Shapes.
   */
  private lineExecute(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
    known: SolidScriptLineRun,
  ): SolidScriptShape[] {
    if (this.failure || this.paused || this.leaving || this.stopping) return [];
    const outer = this.line;
    this.line = node.line;
    const line = this.runOf(node, scope, context, known);
    line.busy = true;
    try {
      this.workTake();
      const shapes = node.command.execute(line.run);
      if (node.command.builds) this.builtNote(node, scope, shapes);
      if (
        shapes.length === 0 &&
        node.command.nesting === 'open' &&
        node.children.length === 0 &&
        !node.otherwise?.length
      )
        this.emptyWarn(node);
      return this.intoShapes(node, shapes);
    } catch (error) {
      if (!this.failure && !this.paused) this.watch(scope);
      this.failure = solidScriptFailureKeep(
        this.failure,
        this.paused !== null,
        solidScriptMistakeHinted(
          error,
          node,
          (name) => scope.variableHas(solidScriptNameKey(name)),
          (name) => this.nameWritten(name),
        ),
        node.line,
      );
      return [];
    } finally {
      line.busy = false;
      this.line = outer;
    }
  }

  /**
   * Runs one line and adds its count and time to the profile; a line that calls
   * itself is timed once, by its outermost run.
   *
   * @param node Line.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @param known Kept run view of the line.
   * @returns Shapes.
   */
  private lineProfiled(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
    known: SolidScriptLineRun,
  ): SolidScriptShape[] {
    if (this.failure || this.paused || this.leaving || this.stopping) return [];
    let entry = this.profile.get(node.line);
    if (!entry) this.profile.set(node.line, (entry = { count: 0, ms: 0 }));
    entry.count += 1;
    if (this.profiled.has(node.line)) return this.lineExecute(node, scope, context, known);
    this.profiled.add(node.line);
    const started = performance.now();
    try {
      return this.lineExecute(node, scope, context, known);
    } finally {
      this.profiled.delete(node.line);
      entry.ms += performance.now() - started;
    }
  }

  /**
   * Records a breakpoint line about to run, and pauses the run when it is the
   * hit to pause at: nothing after it runs, and the variables are the ones the
   * line would see.
   *
   * @param line Line about to run.
   * @param scope Scope it runs in.
   * @returns True when the run paused here.
   */
  private breakReached(line: number, scope: SolidScriptScope): boolean {
    if (!this.breakpoints?.lines.has(line) || this.failure || this.paused || this.stopping) return false;
    const reached = { line, steps: this.steps.length };
    this.breaks.push(reached);
    if (this.breaks.length !== this.breakpoints.pauseAt) return false;
    this.paused = reached;
    this.watch(scope);
    this.systemSeen = this.systemCapture();
    return true;
  }

  /**
   * Runs one step at a line unless the run already stopped; a mistake stops the
   * run there, keeping everything built before it.
   *
   * @param line Line number.
   * @param step Step to run.
   * @returns Its result, or undefined when the run stopped.
   */
  protected guarded<T>(line: number, step: () => T): T | undefined {
    if (this.failure || this.paused || this.leaving || this.stopping) return undefined;
    const outer = this.line;
    this.line = line;
    try {
      this.workTake();
      return step();
    } catch (error) {
      this.failure = solidScriptFailureKeep(this.failure, this.paused !== null, error, line);
      return undefined;
    } finally {
      this.line = outer;
    }
  }

  /**
   * Ties the kept run view of a line to this run, or a new one while the kept
   * one is running, such as in a Function that calls itself.
   *
   * @param node Line.
   * @param scope Scope.
   * @param context Matrix and flatness.
   * @param known Kept run view of the line.
   * @returns Run view of the line.
   */
  private runOf(
    node: SolidScriptBlockNode<Command>,
    scope: SolidScriptScope,
    context: SolidScriptContext,
    known: SolidScriptLineRun,
  ): SolidScriptLineRun {
    const line = known.busy ? solidScriptRunMake(node, SolidScriptMachine.build) : known;
    line.state.machine = this;
    line.state.scope = scope;
    line.state.context = context;
    return line;
  }

  /** Builds the run view of a line, for the kept run views. */
  private static readonly build: SolidScriptRunBuild = (node, state) => SolidScriptMachine.runBuild(node, state);

  /**
   * Builds what a running line can read and do, once per line: its closures
   * read the machine, scope and context of the current run of the line from
   * state.
   *
   * @param node Line.
   * @param state Scope and context of the run, changed before every run.
   * @returns Run view of the line.
   */
  private static runBuild<Command extends SolidScriptMachineCommand>(
    node: SolidScriptBlockNode<Command>,
    state: SolidScriptLineState,
  ): SolidScriptBlockRun {
    const named = node.command.parameters.some((field) => field.key === SOLID_SCRIPT_SHAPE_NAME_KEY);
    const ownName = (): string => (named ? solidScriptValueText(value(SOLID_SCRIPT_SHAPE_NAME_KEY)).trim() : '');
    const labelOf = (): string => ownName() || state.scope.partName || node.command.id;
    let kept: SolidScriptBlockRuns | undefined;
    const children = (): SolidScriptBlockRuns =>
      (kept ??= solidScriptRunsKnown(node.children, SolidScriptMachine.build));
    const inside = (into: SolidScriptContext): SolidScriptShape[] => {
      if (node.children.length === 0) return [];
      return state.machine.linesRun(node.children, state.scope, into, new SolidScriptScope(state.scope), children());
    };
    const fields = new Map<string, SolidScriptLineField>();
    const labels = new Map(node.command.parameters.map((field) => [field.key, field.label]));
    const evaluated = node.command.parameters
      .filter((field) => !solidScriptFieldAsTyped(field))
      .map((field) => field.key);
    const value = (key: string): SolidScriptValue => state.machine.fieldValue(fields, node, key, state.scope);
    /** Fields that read no per-item value, worked out once for all items. */
    const once = new Map<string, SolidScriptValue>();
    const valueWith = (key: string, variables: Readonly<Record<string, SolidScriptValue>>): SolidScriptValue => {
      if (!solidScriptEachUsed(solidScriptLineFieldOf(fields, node, key).text)) {
        if (!once.has(key)) once.set(key, value(key));
        return once.get(key) as SolidScriptValue;
      }
      const inner = new SolidScriptScope(state.scope);
      for (const [name, assigned] of Object.entries(variables))
        inner.variableDefine(state.machine.nameKey(name), assigned);
      return state.machine.fieldValue(fields, node, key, inner);
    };
    const modeOf = (): Readonly<Record<string, string>> => {
      if (!node.command.parameters.some((field) => field.key === 'mode')) return node.values;
      const stored = (node.values['mode'] ?? '').trim();
      if (stored === '') return { ...node.values, mode: '' };
      const mode = stored.includes('[') ? solidScriptValueText(value('mode')) : stored;
      return { ...node.values, mode };
    };
    const intoName = (): string =>
      node.command
        .valueText(node.values, 'into')
        .trim()
        .replace(/^\[(.*)\]$/s, '$1');
    const pathCreated = (points: number[][], closed: boolean): SolidScriptShape[] => {
      if (!state.machine.stepTake(state.scope)) return [];
      const moved = points.map((point) => new THREE.Vector3(...point).applyMatrix4(state.context.matrix).toArray());
      state.machine.variableSet(
        state.scope,
        intoName(),
        state.machine.paths.created(solidScriptPathStraight(moved, closed), labelOf()),
      );
      return [];
    };
    const drawn = (points: readonly SolidScriptPoint2[]): SolidScriptShape[] => {
      state.machine.gatherCheck(node);
      if (!state.context.planar && intoName() !== '') return pathCreated(points.map(solidScriptPathFromFlat), true);
      state.machine.flatCheck(node, state.context, true);
      if (!state.machine.stepTake(state.scope)) return [];
      const moved = points.map(([x, y]): SolidScriptPoint2 => {
        const point = new THREE.Vector3(x, y, 0).applyMatrix4(state.context.matrix);
        return [point.x, point.y];
      });
      const outline = solidScriptShapePolygon(moved, labelOf());
      const into = intoName();
      if (into !== '') state.machine.variableSet(state.scope, into, state.machine.paths.element(outline));
      return [outline];
    };
    const built = (body: () => SolidScriptBody, faceUvs?: SolidScriptFaceUv[]): SolidScriptShape[] => {
      state.machine.gatherCheck(node);
      state.machine.flatCheck(node, state.context, false);
      if (!state.machine.stepTake(state.scope)) return [];
      const made = solidScriptSolidMade(labelOf(), body(), modeOf());
      return state.machine.processed.taken(
        state.machine.modeRolePlaced([
          solidScriptShapeTransform(faceUvs ? { ...made, faceUvs } : made, state.context.matrix),
        ]),
      );
    };
    return {
      values: (key) =>
        solidScriptFieldArguments(node.command.valueText(node.values, key)).map((piece, index) => {
          try {
            return solidScriptFieldResolve('value', piece, state.machine.fieldContext(state.scope));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`value ${index + 1}: ${message}`);
          }
        }),
      get planar() {
        return state.context.planar;
      },
      fields: () => {
        const values = new Map<string, SolidScriptValue>();
        for (const key of evaluated) values.set(key, value(key));
        return new SolidScriptBlockArguments(values, labels);
      },
      text: (key) => {
        const field = solidScriptLineFieldOf(fields, node, key);
        return field.text.includes('[') ? solidScriptValueText(value(key)) : field.text;
      },
      source: (key) => solidScriptLineFieldOf(fields, node, key).text,
      value,
      list: (key) =>
        solidScriptFieldList(solidScriptLineFieldOf(fields, node, key).text, (item) =>
          solidScriptFieldResolve('value', item, state.machine.fieldContext(state.scope)),
        ),
      valueItems(key) {
        const field = solidScriptLineFieldOf(fields, node, key);
        field.listed ??= solidScriptFieldSplit(field.text, ',').length > 1;
        return field.listed ? this.list(key) : value(key);
      },
      variableSet: (name, assigned) => state.machine.variableSet(state.scope, name, assigned),
      variableWrite(name, key) {
        state.machine.variableWrite(state.scope, name, key, this);
      },
      positionsMove: (items, to) => state.machine.positionsMove(items, node.command.label, to),
      solid: (body, faceUvs) => built(() => body, faceUvs),
      solidFromPoints: (points) => built(() => solidScriptBodyHull(points, labelOf())),
      pathFlat: drawn,
      pathWrite: (given, closed) => {
        const points = closed ? solidScriptPathLoopOpen(given) : given;
        if (state.context.planar) {
          if (!closed)
            throw new Error(
              'Linear Extrude, Rotate Extrude and Offset fill closed paths, and this Path is open; turn on Closed',
            );
          return drawn(solidScriptPathFlat(points));
        }
        return pathCreated(
          points.map((point) => point.toArray()),
          closed,
        );
      },
      transformed: (matrix) => inside({ ...state.context, matrix: state.context.matrix.clone().multiply(matrix) }),
      hulled: (extra = []) =>
        !state.machine.stepTake(state.scope)
          ? []
          : state.machine.processed.taken(
              state.machine.modeRolePlaced(
                solidScriptMachineGatherWhile(state.machine.gathering, 'hull', (into) =>
                  solidScriptHullShapes(
                    inside({ ...state.context, matrix: new THREE.Matrix4() }),
                    [...into.points, ...extra],
                    labelOf(),
                    state.context.planar,
                  ).map((shape) => solidScriptShapeTransform(shape, state.context.matrix)),
                ).map((shape) => solidScriptModeApply(shape, modeOf())),
              ),
            ),
      extruded: (fields) => {
        if (state.context.planar) throw new Error('Linear Extrude cannot be inside another Linear Extrude');
        const flat = solidScriptShapeJoin(inside({ matrix: new THREE.Matrix4(), planar: true }), labelOf());
        if (!flat) return [];
        const extruded = solidScriptExtrude(flat, fields, new THREE.Matrix4());
        return state.machine.processed.taken(
          state.machine.modeRolePlaced([
            solidScriptModeApply(
              solidScriptShapeNamed(solidScriptShapeTransform(extruded, state.context.matrix), ownName()),
              modeOf(),
            ),
          ]),
        );
      },
      repeated: (counter, values, keyed) => {
        state.machine.nameCheck(counter, 'a counter');
        state.machine.writableCheck(counter);
        const key = state.machine.nameKey(counter);
        if (keyed) {
          state.machine.nameCheck(keyed.name, 'a key');
          state.machine.writableCheck(keyed.name);
        }
        const keyName = keyed ? state.machine.nameKey(keyed.name) : '';
        const shapes: SolidScriptShape[] = [];
        // Later rounds can Select and Move brushes earlier rounds already built.
        // [$Selected.*] is not copied: it carries from round to round and stays after.
        state.machine.builtStack.push(shapes);
        try {
          values.forEach((round, index) => {
            state.machine.workTake();
            const inner = new SolidScriptScope(state.scope);
            inner.variableDefine(key, round);
            if (keyed) inner.variableDefine(keyName, keyed.keys[index]);
            solidScriptScopeElementBind(inner, round, index);
            if (node.children.length === 0) return;
            const built = state.machine.linesRun(node.children, inner, state.context, inner, children());
            for (const shape of built) shapes.push(shape);
          });
        } finally {
          state.machine.builtStack.pop();
        }
        const joined = solidScriptShapeJoin(shapes, labelOf());
        return joined ? [joined] : [];
      },
      branched: (holds) => {
        const lines = holds ? node.children : (node.otherwise ?? []);
        if (lines.length === 0) return [];
        const known = holds ? children() : solidScriptRunsKnown(lines, SolidScriptMachine.build);
        return state.machine.linesRun(lines, state.scope, state.context, new SolidScriptScope(state.scope), known);
      },
      inPlace: () => state.machine.linesRun(node.children, state.scope, state.context, state.scope, children()),
      outputStamp: (value) =>
        state.machine.modeRolePlaced(state.machine.outputStamp(value, state.scope, state.context)),
      grouped: () => {
        state.machine.groupEnter();
        try {
          return state.machine.modeRolePlaced(
            state.machine.grouped(
              inside(state.context),
              labelOf(),
              solidScriptGroupModeOf(modeOf()['mode']) ?? SOLID_SCRIPT_GROUP_MODE_DEFAULT,
              node,
            ),
          );
        } finally {
          state.machine.groupLeave();
        }
      },
      partKeep: () =>
        state.machine.partKeep(
          node,
          solidScriptValueText(value('name')).trim(),
          solidScriptGroupModeOf(modeOf()['mode']) ?? SOLID_SCRIPT_GROUP_MODE_DEFAULT,
          state.scope,
          (inner) => {
            state.machine.groupEnter();
            try {
              return state.machine.linesRun(node.children, inner, state.context, inner, children());
            } finally {
              state.machine.groupLeave();
            }
          },
        ),
      built: () => state.machine.shapesLatest(state.machine.builtStack.flat()),
      get elements() {
        return state.machine.elements;
      },
      selectedGet: (kind) => {
        const list = state.machine.systemList(`selected.${kind}`);
        return Array.isArray(list) ? [...list] : [];
      },
      selectedSet: (kind, values) => {
        state.machine.selected[kind] = [...values];
      },
      selectFresh: (kind, items) => state.machine.selectFresh(kind, items),
      selectNote: (kind, items) => state.machine.selectNote(kind, items),
      ofValues: () => state.machine.ofRead(node, value),
      inputsBuilt: (shapes) => {
        state.machine.received = solidScriptGeometryLeaves([...shapes]);
      },
      receivedLatest: () => state.machine.receivedLatest(),
      receivedModes: () => state.machine.receivedModes(),
      framed: (matrix) => inside({ ...state.context, matrix }),
      leafLatest: (leaf) => state.machine.leafLatestOf(leaf),
      leafReplace: (leaf, found) => {
        state.machine.leafRewrite(leaf, found);
      },
      pathDrawn: (element) => state.machine.paths.drawn(element),
      pathReplace: (element, by) => state.machine.paths.replace(element, by, state.machine.builtStack),
      toolCopyStart: () => state.machine.toolCopyStart(),
      toolCopyEnd: () => state.machine.toolCopyEnd(),
      toolCopyResults: () => state.machine.toolCopyResults(),
      partAdopt: (leaves, shapes) => state.machine.partAdopt(leaves, shapes),
      adopted: (shapes) => state.machine.processed.taken(shapes.filter(() => state.machine.stepTake(state.scope))),
      gathered: (what) => {
        const into: SolidScriptGathering = { kind: what, points: [], uvs: [], faces: [] };
        state.machine.gathering.push(into);
        try {
          if (node.children.length > 0)
            state.machine.linesRun(node.children, state.scope, {
              matrix: new THREE.Matrix4(),
              planar: state.context.planar,
            });
        } finally {
          state.machine.gathering.pop();
        }
        return into;
      },
      local: (planar) => inside({ matrix: new THREE.Matrix4(), planar }),
      placed: (shapes) =>
        state.machine.modeRolePlaced(
          shapes
            .map((shape) => solidScriptShapeTransform(shape, state.context.matrix))
            .map((shape) => solidScriptModeApply(shape, modeOf())),
        ),
      leave: (returned) => {
        const frame = state.machine.stack[state.machine.stack.length - 1];
        if (!frame) throw new Error('Return leaves a Function or a part, so it only works inside one of them');
        if (returned !== undefined) {
          if (frame.kind !== 'function')
            throw new Error('a Return with a Value only works in a Function; a part hands back results in variables');
          frame.returned = { value: returned };
        }
        state.machine.leaving = true;
        return [];
      },
      stop: () => {
        state.machine.stopping = true;
        return [];
      },
      call: (name, values, result) => state.machine.functionCallLine(name, values, result, state.scope, state.context),
      get handling() {
        return state.machine.handling;
      },
      inputSet: (name, assigned) => {
        if (!state.machine.handling)
          throw new Error(
            'Set Input only works in When Input Changes or When Button Pressed; the inspector sets inputs',
          );
        const key = solidScriptNameKey(name);
        if (state.machine.readOnly.get(key) !== 'input')
          throw new Error(`there is no input "${name}"; add an Input line for it`);
        state.machine.root.variableSet(key, assigned);
        state.machine.inputsChanged[state.machine.spellings.get(key) ?? name] = solidScriptValueText(assigned);
      },
      notice: (text) => {
        if (!state.machine.handling)
          throw new Error('Show Message only works in When Input Changes or When Button Pressed; use Echo here');
        state.machine.notices.push(text);
      },
      point: (position, uv) => {
        const into = state.machine.gathering[state.machine.gathering.length - 1];
        if (!into)
          throw new Error(
            `a ${node.command.label} belongs between a Polyhedron, Polygon, Hull or Mesh line and its End`,
          );
        if (node.command.id === 'vertex' && into.kind !== 'mesh')
          throw new Error('a Vertex belongs in a Mesh; use Point lines in a Polyhedron or Polygon');
        if (node.command.id !== 'vertex' && into.kind === 'mesh')
          throw new Error('a Mesh takes Vertex lines; Point lines belong in a Polyhedron or Polygon');
        into.points.push(position.clone().applyMatrix4(state.context.matrix));
        into.uvs.push(uv);
        return [];
      },
      face: (corners) => {
        const into = state.machine.gathering[state.machine.gathering.length - 1];
        if (into?.kind !== 'mesh') throw new Error('a Face belongs between a Mesh line and its End');
        into.faces.push([...corners]);
        return [];
      },
      mesh: (mesh) => {
        state.machine.gatherCheck(node);
        state.machine.flatCheck(node, state.context, false);
        if (!state.machine.stepTake(state.scope)) return [];
        return state.machine.processed.taken([
          solidScriptMeshChecked(solidScriptMeshTransform({ ...mesh, label: labelOf() }, state.context.matrix)),
        ]);
      },
      valueWith,
      fieldsWith: (variables) => {
        const values = new Map<string, SolidScriptValue>();
        for (const key of evaluated) values.set(key, valueWith(key, variables));
        return new SolidScriptBlockArguments(values, labels);
      },
      print: (text) => {
        state.machine.messages.push(text);
        return [];
      },
      inputValue: (name) => state.machine.inputs[name] ?? state.machine.inputKeyed().get(solidScriptNameKey(name)),
      use: () => state.machine.system.use ?? SOLID_SCRIPT_USE_GENERATOR,
      matrix: () => state.context.matrix.clone(),
      inputDefine: (name, value) => {
        state.machine.nameCheck(name, 'an input');
        const key = state.machine.nameKey(name);
        if (state.machine.readOnly.has(key)) throw new Error(`an input named "${name}" is already defined`);
        if (state.scope.variableHas(key))
          throw new Error(`"${name}" is already a variable; inputs come before the lines that use them`);
        state.scope.variableDefine(key, value);
        state.machine.readOnly.set(key, 'input');
      },
      listRead: (name) => state.machine.listRead(state.scope, name),
      listUpdate: (name, change, create) => {
        const where = state.machine.variableWhere(name, state.scope);
        if (!create || where.scope.variableHas(where.name)) {
          state.machine.variableSet(state.scope, name, change(state.machine.listRead(state.scope, name)));
          return;
        }
        state.machine.variableSet(state.scope, name, change([]));
      },
      variableDelete: (name) => state.machine.variableDeleteLine(state.scope, name),
      variableClear: (name) => state.machine.variableClearLine(state.scope, name),
      itemRemove: (target) => state.machine.variableItemRemove(state.scope, target),
    };
  }

  /**
   * Evaluates one field of a line.
   *
   * @param fields Fields of the line read so far, by key.
   * @param node Line.
   * @param key Field key.
   * @param scope Scope.
   * @returns Value.
   */
  private fieldValue(
    fields: Map<string, SolidScriptLineField>,
    node: SolidScriptBlockNode<Command>,
    key: string,
    scope: SolidScriptScope,
  ): SolidScriptValue {
    return this.fieldRead(solidScriptLineFieldOf(fields, node, key), scope);
  }

  /**
   * Reads a field of a line in a scope, the one way every field is read; a
   * mistake names the field unless the message already starts with it.
   *
   * @param field Field, from solidScriptLineFieldMake.
   * @param scope Scope.
   * @returns Value.
   */
  fieldRead(field: SolidScriptLineField, scope: SolidScriptScope): SolidScriptValue {
    try {
      return field.compiled(this.fieldContext(scope));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message.startsWith(`${field.label} `) ? message : `${field.label}: ${message}`);
    }
  }

  /**
   * Fails when a shape is built among the Point lines of a Polyhedron or
   * Polygon.
   *
   * @param node Line.
   */
  private gatherCheck(node: SolidScriptBlockNode<Command>): void {
    solidScriptMachineGatherCheck(this.gathering, node.command.label);
  }

  /**
   * Fails when a shape is drawn where it cannot be: flat shapes only inside
   * Linear Extrude, solids only outside it.
   *
   * @param node Line.
   * @param context Matrix and flatness.
   * @param flat True for a flat shape.
   */
  private flatCheck(node: SolidScriptBlockNode<Command>, context: SolidScriptContext, flat: boolean): void {
    solidScriptMachineFlatCheck(node.command.label, context.planar, flat);
  }

  /**
   * Records one shape step at the current line.
   *
   * @param scope Scope of the shape, watched while the step gets built.
   * @returns True while the step is within the step limit and gets built.
   */
  private stepTake(scope: SolidScriptScope): boolean {
    this.steps.push(this.line);
    if (this.steps.length > this.stepLimit) return false;
    this.watch(scope);
    if (this.steps.length === this.stepLimit) this.systemPending = true;
    this.solids += 1;
    if (this.solids > SOLID_SCRIPT_LIMITS.brushes)
      throw new Error(
        `this line made more than ${solidScriptLimitCount(SOLID_SCRIPT_LIMITS.brushes)} solids. Change the Count, or split this into smaller generators.`,
      );
    return true;
  }

  /**
   * Remembers the scope and the call stack of a step, for the debugger.
   *
   * @param scope Scope of the running line.
   */
  private watch(scope: SolidScriptScope): void {
    this.watched = scope;
    this.watchedValues = this.steps.length === this.stepLimit ? scope.variablesVisible() : null;
    this.stackSeen = this.stack.map((frame) => this.frameView(frame, frame.locals?.variablesVisible() ?? new Map()));
  }

  /**
   * Shows one running Function or part as the debugger lists it.
   *
   * @param frame Frame.
   * @param locals Its own variables.
   * @returns Frame with its variables as text.
   */
  private frameView(frame: SolidScriptFrame, locals: ReadonlyMap<string, SolidScriptValue>): SolidScriptFrameView {
    const name = this.nameShown(solidScriptNameKey(frame.name));
    return {
      name: frame.kind === 'function' ? `${name}()` : `part ${name}`,
      line: frame.line,
      locals: [...locals].map(([key, value]) =>
        solidScriptVariableView(this.nameShown(`${SOLID_SCRIPT_LOCAL_PREFIX}${key}`), value),
      ),
    };
  }

  /**
   * Keeps the variables a line sees just before it runs, replacing those of its
   * earlier runs, while the run is still before where its values get shown: not
   * after a stop, nor past the last step within the step limit. Once too many
   * values were kept, the line keeps nothing instead of older values.
   *
   * @param line 1-based line about to run.
   * @param scope Scope it runs in.
   */
  private lineSeenNote(line: number, scope: SolidScriptScope): void {
    if (this.failure || this.paused || this.leaving || this.stopping || this.passedSeen !== null) return;
    if (this.lineSeenValues >= SOLID_SCRIPT_SEEN_LIMIT) {
      this.lineSeen.set(line, null);
      return;
    }
    // Values never change in place, so the bindings alone keep them as they are now.
    const variables = scope.variablesVisible();
    const stack = this.stack.map((frame) => ({ frame, locals: frame.locals?.variablesVisible() ?? new Map() }));
    this.lineSeenValues += 1 + variables.size;
    for (const frame of stack) this.lineSeenValues += frame.locals.size;
    this.lineSeen.set(line, { variables, stack });
  }

  /**
   * Turns the kept variables of every line into text.
   *
   * @returns Variables and stack just before each line last ran, by line; null
   *   for a line that ran too often to keep them.
   */
  private lineSeenViews(): Map<number, SolidScriptLineSeen | null> {
    const views = new Map<number, SolidScriptLineSeen | null>();
    for (const [line, seen] of this.lineSeen)
      views.set(
        line,
        seen && {
          variables: [...seen.variables].map(([name, value]) =>
            solidScriptVariableView(this.spellings.get(name) ?? name, value),
          ),
          stack: seen.stack.map(({ frame, locals }) => this.frameView(frame, locals)),
        },
      );
    return views;
  }

  /**
   * Reads every system list of the catalog, such as [$Selected.Faces], as the
   * run holds them now.
   *
   * @returns The lists with their values as text.
   */
  private systemCapture(): SolidScriptVariable[] {
    this.capturingSystem = true;
    try {
      const seen: SolidScriptVariable[] = [];
      for (const entry of SOLID_SCRIPT_SYSTEM_CATALOG) {
        const list = this.systemList(solidScriptNameKey(entry.name.slice(1)));
        if (list !== undefined) seen.push(solidScriptVariableView(entry.name, list));
      }
      return seen;
    } finally {
      this.capturingSystem = false;
    }
  }

  /** Counts one step of work and stops a run that never ends. */
  protected workTake(): void {
    this.work += 1;
    if (this.work > SOLID_SCRIPT_WORK_LIMIT)
      throw new Error(
        `the script stopped after ${solidScriptLimitCount(SOLID_SCRIPT_WORK_LIMIT)} steps of work. Check Repeat ranges, or split this into smaller generators.`,
      );
  }
}
