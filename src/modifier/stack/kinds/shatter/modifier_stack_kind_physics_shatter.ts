import { SolidOperation } from '@/solid/types/solid_operation.js';
import * as THREE from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { ModifierStackKind, type ModifierStackCategory } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import { modifierStackFieldsNormalize } from '@/modifier/stack/modifier_stack_fields.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import type { PhysicsShatterResult } from './fracture/physics_shatter_types.js';
import { physicsShatterFracture } from './fracture/physics_shatter_fracture.js';
import { physicsShatterInputHash } from './fracture/physics_shatter_hash.js';
import { PHYSICS_SHATTER_FIELDS } from './physics_shatter_fields.js';
import { PHYSICS_SHATTER_ACTION_FIELDS } from './physics_shatter_action_fields.js';
import { physicsShatterPreviewActive } from './sim/physics_shatter_preview.js';
import {
  physicsShatterBlastRead,
  physicsShatterInsideRead,
  physicsShatterSettingsRead,
} from './physics_shatter_settings.js';
import { physicsShatterBakeKey } from './physics_shatter_bake_key.js';
import {
  physicsShatterGather,
  physicsShatterHideAuthored,
  physicsShatterInputNotes,
  type PhysicsShatterGathered,
} from './physics_shatter_inputs.js';
import { physicsShatterOutputUnit, type PhysicsShatterOutputJob } from './physics_shatter_output.js';
import { physicsShatterLastRunOf, physicsShatterLastRunStore } from './physics_shatter_last_run.js';
import { physicsShatterBlastHelpers } from './physics_shatter_blast_guide.js';
import {
  PHYSICS_SHATTER_BAKE_KEY,
  PHYSICS_SHATTER_BAKE_STALE,
  physicsShatterBakeKeep,
  physicsShatterBakeStateRead,
  type PhysicsShatterBakeDecoder,
  type PhysicsShatterBakeState,
} from './physics_shatter_bake_state.js';
import {
  PHYSICS_SHATTER_FORMAT_FUTURE,
  PHYSICS_SHATTER_FORMAT_VERSION,
  PHYSICS_SHATTER_FORMAT_VERSION_KEY,
  physicsShatterFormatIsFuture,
  physicsShatterFormatMigrate,
  physicsShatterFormatVersionOf,
} from './physics_shatter_format_version.js';
import { physicsShatterMaterialPreset, physicsShatterShattering } from './fracture/physics_shatter_material_presets.js';
import { physicsShatterPatternSpec } from './fracture/physics_shatter_patterns.js';

/** Persisted kind id of the Physics Shatter modifier. */
export const MODIFIER_STACK_KIND_PHYSICS_SHATTER = 'physicsShatter';

/**
 * Breaks the input into convex pieces, glass cracks or bricks, and places each
 * piece where a physics simulation of a blast left it. The simulated poses are
 * stored in the parameters, so every peer builds the same rubble.
 */
export class ModifierStackKindPhysicsShatter extends ModifierStackKind {
  readonly id = MODIFIER_STACK_KIND_PHYSICS_SHATTER;
  readonly label = 'Physics Shatter';
  readonly category: ModifierStackCategory = 'shape';
  readonly description =
    'Breaks the input into convex pieces and blasts them apart with physics. Simulate stores where they land.';
  readonly fields: readonly ModifierStackField[] = [...PHYSICS_SHATTER_FIELDS, ...PHYSICS_SHATTER_ACTION_FIELDS];

  /**
   * Creates the modifier.
   *
   * @param bakeDecoder Turns stored bake text into piece transforms.
   */
  constructor(private readonly bakeDecoder: PhysicsShatterBakeDecoder) {
    super();
  }

  /**
   * Normalizes the fields and keeps the stored bake, its input hash and the
   * format version. Known older formats are migrated to the current one; a
   * newer format keeps its version so it is never mistaken for this one.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  protected override normalizeCurrent(input: Record<string, unknown>): Record<string, unknown> {
    const future = physicsShatterFormatIsFuture(input);
    const current = future ? input : physicsShatterFormatMigrate(input);
    const output = modifierStackFieldsNormalize(this.fields, current);
    physicsShatterBakeKeep(current, output);
    output[PHYSICS_SHATTER_FORMAT_VERSION_KEY] = future
      ? physicsShatterFormatVersionOf(input)
      : PHYSICS_SHATTER_FORMAT_VERSION;
    return output;
  }

  /**
   * Starts new modifiers at the current format version.
   *
   * @returns Partial parameters.
   */
  override createParameters(): Record<string, unknown> {
    return { [PHYSICS_SHATTER_FORMAT_VERSION_KEY]: PHYSICS_SHATTER_FORMAT_VERSION };
  }

  /**
   * Returns false: the pieces replace the authored brushes.
   *
   * @returns False.
   */
  override passesAuthoredInput(): boolean {
    return false;
  }

  /**
   * Draws the blast arrow and radius ring.
   *
   * @param volume Owning volume.
   * @param parameters Normalized parameters.
   * @returns Helper lines in the volume's local space.
   */
  override helpers(volume: THREE.Object3D, parameters: Record<string, unknown>): THREE.Object3D[] {
    return physicsShatterBlastHelpers(volume, parameters);
  }

  /**
   * Returns what the step makes and whether rubble is stored.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const bake = parameters[PHYSICS_SHATTER_BAKE_KEY];
    const simulated = typeof bake === 'string' && bake.length > 0 ? 'Simulated' : 'Not Simulated';
    return `${this.summaryPattern(parameters)} · ${simulated}`;
  }

  /**
   * Returns the summary's first part: Whole Brushes while Shatter is off, else
   * the material (or the custom pattern) and its size.
   *
   * @param parameters Normalized parameters.
   * @returns Pattern text.
   */
  private summaryPattern(parameters: Record<string, unknown>): string {
    if (!physicsShatterShattering(parameters)) return 'Whole Brushes';
    const size = `${String(parameters['crackSize'])} m`;
    const flat = parameters['cracks'] === '2d' ? ' 2D' : '';
    const material = physicsShatterSettingsRead(parameters).material;
    const mode = String(parameters['mode']);
    const spec = physicsShatterPatternSpec(mode);
    const custom = mode === 'bricks' ? spec.label : mode === 'glass' ? `Cells${flat} ${size}` : `${spec.label} ${size}`;
    const { label } = physicsShatterMaterialPreset(material);
    return material === 'custom' ? custom : material === 'brick' ? label : `${label} ${size}`;
  }

  /**
   * Fractures the working set and places every piece at its baked pose.
   * Subtractive units ahead of every additive one carve nothing the step
   * breaks, only what lies before them in the world, so they pass through
   * unchanged and stay in place: a Blast Hole's cut keeps cutting the wall
   * while its filled-back pieces are shattered.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns One derived unit per piece.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const frameToWorld = modifierStackFrame(context.volume, 'volume');
    const frameToModel = context.solidRoot.matrixWorld.clone().invert().multiply(frameToWorld);
    const passed = physicsShatterLeadingSubtractive(units);
    const broken = units.slice(passed.length);
    const gathered = physicsShatterGather(broken, context, frameToModel.clone().invert());
    physicsShatterHideAuthored(broken, context);
    if (gathered.inputs.length === 0 || physicsShatterPreviewActive(context.volume.uuid, context.step.id))
      return passed;
    const { fracture, bake } = this.evaluate(context, gathered, frameToWorld);
    this.reportOf(fracture, bake, context, physicsShatterInputNotes(broken, context));
    const inside = physicsShatterInsideRead(context.step.parameters);
    return [...passed, ...this.outputOf(fracture, bake, { context, sources: gathered.sources, frameToModel, inside })];
  }

  /**
   * Fractures the inputs, reads the bake against them and remembers the run for
   * the simulation.
   *
   * @param context Evaluation context.
   * @param gathered Fracture inputs.
   * @param frameToWorld Modifier frame to world matrix.
   * @returns Fracture and bake state.
   */
  private evaluate(
    context: ModifierStackContext,
    gathered: PhysicsShatterGathered,
    frameToWorld: THREE.Matrix4,
  ): { fracture: PhysicsShatterResult; bake: PhysicsShatterBakeState } {
    const parameters = context.step.parameters;
    const settings = physicsShatterSettingsRead(parameters);
    const inputHash = physicsShatterInputHash(gathered.inputs, settings);
    const fracture = this.fractureOf(context, gathered, inputHash);
    const bakeKey = physicsShatterBakeKey(inputHash, parameters);
    const bake: PhysicsShatterBakeState = physicsShatterFormatIsFuture(parameters)
      ? { status: 'unsupported', transforms: null }
      : physicsShatterBakeStateRead(parameters, { bakeKey, inputHash }, fracture.pieces.length, this.bakeDecoder);
    const blast = physicsShatterBlastRead(parameters);
    const inputBrushIds = gathered.inputs.map((input) => input.sourceBrushId);
    const { material } = settings;
    const run = { inputHash, bakeKey, inputBrushIds, fracture, material, frameToWorld, blast, status: bake.status };
    physicsShatterLastRunStore(context.volume.uuid, context.step.id, run);
    return { fracture, bake };
  }

  /**
   * Returns the fracture for an input hash, reusing the last one when the hash
   * is unchanged.
   *
   * @param context Evaluation context.
   * @param gathered Fracture inputs.
   * @param inputHash Hash of the inputs.
   * @returns Fracture result.
   */
  private fractureOf(
    context: ModifierStackContext,
    gathered: PhysicsShatterGathered,
    inputHash: string,
  ): PhysicsShatterResult {
    const last = physicsShatterLastRunOf(context.volume.uuid, context.step.id);
    if (last && last.inputHash === inputHash) return last.fracture;
    return physicsShatterFracture(gathered.inputs, physicsShatterSettingsRead(context.step.parameters));
  }

  /**
   * Builds the output units, as many as the brush budget allows.
   *
   * @param fracture Fracture result.
   * @param bake Bake state.
   * @param job Shared output state.
   * @returns Derived units.
   */
  private outputOf(
    fracture: PhysicsShatterResult,
    bake: PhysicsShatterBakeState,
    job: PhysicsShatterOutputJob,
  ): ModifierStackUnit[] {
    const granted = job.context.budget.takeCopies(1, fracture.pieces.length);
    if (granted < fracture.pieces.length)
      job.context.report.error = `Brush budget reached: ${granted} of ${fracture.pieces.length} pieces made.`;
    const units: ModifierStackUnit[] = [];
    for (const piece of fracture.pieces.slice(0, granted)) {
      const unit = physicsShatterOutputUnit(piece, bake.transforms?.[piece.index] ?? null, job);
      if (unit) units.push(unit);
    }
    return units;
  }

  /**
   * Writes the step feedback: input notes, stale rubble, the piece limit and
   * dropped slivers.
   *
   * @param fracture Fracture result.
   * @param bake Bake state.
   * @param context Evaluation context.
   * @param notes Notes about inputs the fracture cannot honour.
   */
  private reportOf(
    fracture: PhysicsShatterResult,
    bake: PhysicsShatterBakeState,
    context: ModifierStackContext,
    notes: readonly string[],
  ): void {
    const messages: string[] = [...notes];
    if (bake.status === 'stale') messages.push(PHYSICS_SHATTER_BAKE_STALE);
    if (bake.status === 'unsupported') messages.push(PHYSICS_SHATTER_FORMAT_FUTURE);
    if (fracture.limited) messages.push(`Max Pieces reached: ${fracture.pieces.length} pieces made.`);
    if (fracture.droppedPieces > 0) messages.push(`Dropped ${fracture.droppedPieces} sliver piece(s).`);
    context.report.error = messages.join(' ');
  }
}

/**
 * Returns the leading units whose brushes are all subtractive.
 *
 * @param units Working set in CSG order.
 * @returns Leading subtractive units.
 */
export function physicsShatterLeadingSubtractive(units: readonly ModifierStackUnit[]): ModifierStackUnit[] {
  const leading: ModifierStackUnit[] = [];
  for (const unit of units) {
    if (unit.brushes.length === 0 || unit.brushes.some((brush) => brush.operation !== SolidOperation.Subtractive))
      break;
    leading.push(unit);
  }
  return leading;
}
