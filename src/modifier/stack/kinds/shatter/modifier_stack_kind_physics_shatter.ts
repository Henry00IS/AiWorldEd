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
import {
  physicsShatterBlastRead,
  physicsShatterInsideRead,
  physicsShatterSettingsRead,
} from './physics_shatter_settings.js';
import {
  physicsShatterGather,
  physicsShatterHideAuthored,
  type PhysicsShatterGathered,
} from './physics_shatter_inputs.js';
import { physicsShatterOutputUnit, type PhysicsShatterOutputJob } from './physics_shatter_output.js';
import { physicsShatterLastRunOf, physicsShatterLastRunStore } from './physics_shatter_last_run.js';
import { physicsShatterBlastHelpers } from './physics_shatter_helpers.js';
import {
  PHYSICS_SHATTER_BAKE_KEY,
  PHYSICS_SHATTER_BAKE_STALE,
  physicsShatterBakeKeep,
  physicsShatterBakeStateRead,
  type PhysicsShatterBakeDecoder,
  type PhysicsShatterBakeState,
} from './physics_shatter_bake_state.js';

/** Persisted kind id of the Physics Shatter modifier. */
export const MODIFIER_STACK_KIND_PHYSICS_SHATTER = 'physicsShatter';

/** Decoder used until a bake codec is installed: no stored bake decodes. */
const PHYSICS_SHATTER_BAKE_DECODER_NONE: PhysicsShatterBakeDecoder = () => null;

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
  readonly fields: readonly ModifierStackField[] = PHYSICS_SHATTER_FIELDS;

  /**
   * Creates the modifier.
   *
   * @param bakeDecoder Turns stored bake text into piece transforms.
   */
  constructor(private readonly bakeDecoder: PhysicsShatterBakeDecoder = PHYSICS_SHATTER_BAKE_DECODER_NONE) {
    super();
  }

  /**
   * Normalizes the fields and keeps the stored bake and its input hash.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    const output = modifierStackFieldsNormalize(this.fields, input);
    physicsShatterBakeKeep(input, output);
    return output;
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
   * Returns the pattern and whether rubble is stored.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const pattern = parameters['mode'] === 'bricks' ? 'Bricks' : `Glass ${String(parameters['crackSize'])} m`;
    const bake = parameters[PHYSICS_SHATTER_BAKE_KEY];
    return `${pattern} · ${typeof bake === 'string' && bake.length > 0 ? 'Simulated' : 'Not Simulated'}`;
  }

  /**
   * Fractures the working set and places every piece at its baked pose.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns One derived unit per piece.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const frameToWorld = modifierStackFrame(context.volume, 'volume');
    const frameToModel = context.solidRoot.matrixWorld.clone().invert().multiply(frameToWorld);
    const gathered = physicsShatterGather(units, context, frameToModel.clone().invert());
    physicsShatterHideAuthored(units, context);
    if (gathered.inputs.length === 0) return [];
    const { fracture, bake } = this.evaluate(context, gathered, frameToWorld);
    this.reportOf(fracture, bake, context);
    const inside = physicsShatterInsideRead(context.step.parameters);
    return this.outputOf(fracture, bake, { context, sources: gathered.sources, frameToModel, inside });
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
    const inputHash = physicsShatterInputHash(gathered.inputs, physicsShatterSettingsRead(parameters));
    const fracture = this.fractureOf(context, gathered, inputHash);
    const bake = physicsShatterBakeStateRead(parameters, inputHash, fracture.pieces.length, this.bakeDecoder);
    const blast = physicsShatterBlastRead(parameters);
    const run = { inputHash, fracture, frameToWorld, blast, status: bake.status };
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
   * Writes the step feedback: stale rubble, the piece limit and dropped
   * slivers.
   *
   * @param fracture Fracture result.
   * @param bake Bake state.
   * @param context Evaluation context.
   */
  private reportOf(fracture: PhysicsShatterResult, bake: PhysicsShatterBakeState, context: ModifierStackContext): void {
    const messages: string[] = [];
    if (bake.status === 'stale') messages.push(PHYSICS_SHATTER_BAKE_STALE);
    if (fracture.limited) messages.push(`Max Pieces reached: ${fracture.pieces.length} pieces made.`);
    if (fracture.droppedPieces > 0) messages.push(`Dropped ${fracture.droppedPieces} sliver piece(s).`);
    context.report.error = messages.join(' ');
  }
}
