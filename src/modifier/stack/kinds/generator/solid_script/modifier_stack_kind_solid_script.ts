import type { ModifierStackPoseFollow } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import {
  modifierStackSlidersOfScript,
  modifierStackSlidersPlaced,
  modifierStackSlidersRecord,
} from '@/modifier/stack/widgets/modifier_stack_slider_record.js';
import * as THREE from 'three';
import { modifierStackPathsRecord } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import {
  modifierStackScenePathsFollowed,
  modifierStackScenePathsKey,
  modifierStackScenePathsLink,
} from '@/modifier/stack/kinds/generator/path/modifier_stack_scene_paths.js';
import { modifierStackDrawsRecord } from '@/modifier/stack/widgets/modifier_stack_draw_record.js';
import { modifierStackButtonsRecord } from '@/modifier/stack/widgets/modifier_stack_button_record.js';
import { modifierStackAimsRecord } from '@/modifier/stack/widgets/modifier_stack_aim_record.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
} from './modifier_stack_solid_script_keys.js';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { solidScriptInspectorRow } from '@/solid_script/ui/solid_script_inspector_row.js';
import {
  solidScriptInspectorInputs,
  solidScriptInspectorInputValues,
} from '@/solid_script/ui/solid_script_inspector_inputs.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierStackKindGeneratorBase } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import {
  solidScriptDocumentDefault,
  solidScriptDocumentNormalize,
  solidScriptDocumentUseProblem,
  type SolidScriptUse,
} from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_USE_GENERATOR, type SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { solidScriptBrushModeLabel, solidScriptModeLabel } from '@/solid_script/language/solid_script_mode.js';
import { solidScriptDebugStepLimit } from '@/solid_script/debug/solid_script_debug_steps.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackSolidScriptBoxValues } from './modifier_stack_solid_script_box.js';
import { solidScriptDocumentReadsBoxMember } from '@/solid_script/language/solid_script_use_check.js';
import { modifierStackSolidScriptSurfaces } from './modifier_stack_solid_script_surfaces.js';
import { modifierStackSolidScriptSmooth } from './modifier_stack_solid_script_smooth.js';
import {
  modifierStackSolidScriptLayout,
  type ModifierStackSolidScriptPassed,
  type ModifierStackSolidScriptPlacement,
} from './modifier_stack_solid_script_layout.js';

/**
 * Fields of a SolidScript step before the shared texture and output ones.
 *
 * @param use How the step uses its script: as a generator or a modifier.
 * @returns Fields.
 */
export function modifierStackSolidScriptFields(use: SolidScriptUse): readonly ModifierStackField[] {
  return [
    {
      key: 'scriptFile',
      label: 'Script',
      type: 'widget',
      default: '',
      hint: `The script this ${use} runs; edit it in the script editor or drop an .aiscript file on it. Assistants use geometry_script_generator_set.`,
      widget: (targetOf) =>
        solidScriptInspectorRow(targetOf, MODIFIER_STACK_SOLID_SCRIPT_KEY, MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY, use),
    },
    {
      key: 'scriptInputs',
      label: 'Inputs',
      type: 'widget',
      default: '',
      hint: 'The settings the script defines with Input lines.',
      widget: (targetOf) =>
        solidScriptInspectorInputs(targetOf, MODIFIER_STACK_SOLID_SCRIPT_KEY, MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY),
    },
    {
      key: 'placement',
      label: 'Placement',
      type: 'choice',
      default: 'origin',
      choices: modifierStackChoices([
        ['origin', 'Script Units'],
        ['fit', 'Fit Box'],
        ['stretch', 'Stretch to Box'],
      ]),
      hint:
        use === 'generator'
          ? 'Script Units: metres from the center of the box, which is the script origin [0, 0, 0]. Fit Box: scaled evenly to fit. Stretch to Box: fills the box.'
          : 'Script Units: metres from the center of what the modifier receives, the script origin [0, 0, 0]. Fit Box: scaled evenly to fit around it. Stretch to Box: fills its bounds.',
    },
  ];
}

/**
 * Generator that builds the result of a script of command lines and code: every
 * primitive becomes a convex brush and every difference or intersection a CSG
 * group, rebuilt whenever the script changes.
 */
export class ModifierStackKindSolidScript extends ModifierStackKindGeneratorBase {
  readonly id: string = MODIFIER_STACK_SOLID_SCRIPT_KIND;
  readonly label: string = 'Solid Script';
  readonly description: string =
    'Builds objects from a Solid Script of command lines. Edit Script opens the editor with its command palette; .aiscript files from the project browser can be dropped on the Script row.';
  protected readonly specificFields = modifierStackSolidScriptFields('generator');

  /**
   * Returns valid parameters with the stored script read line by line.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  protected override normalizeCurrent(input: Record<string, unknown>): Record<string, unknown> {
    const script = solidScriptDocumentNormalize(input[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    return {
      ...super.normalizeCurrent(input),
      [MODIFIER_STACK_SOLID_SCRIPT_KEY]: script,
      [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: solidScriptInspectorInputValues(
        input[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY],
      ),
    };
  }

  /**
   * Returns how the brushes follow a move or turn of the node. They follow any
   * move or turn unless the script reads the volume's position or rotation, or
   * follows a Path object that stays where it is, which would go stale.
   *
   * @param parameters Normalized parameters.
   * @returns 'rigid', 'translate' when only rotation is read, or null when
   *   position is read or a Path object is followed.
   */
  override volumePoseFollow(parameters: Record<string, unknown>): ModifierStackPoseFollow | null {
    if (
      modifierStackScenePathsFollowed(
        solidScriptInspectorInputValues(parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]),
      )
    )
      return null;
    const document = solidScriptDocumentNormalize(parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    if (solidScriptDocumentReadsBoxMember(document, 'Position')) return null;
    if (solidScriptDocumentReadsBoxMember(document, 'Rotation')) return 'translate';
    return 'rigid';
  }

  /**
   * Returns where the Path objects the script's inputs follow are and what they
   * hold, so the script runs again when one changes.
   *
   * @param volume Owning volume.
   * @param parameters Stored parameters.
   * @returns Key text, or empty when no input follows a Path object.
   */
  override sceneReadsKey(volume: THREE.Object3D, parameters: Record<string, unknown>): string {
    return modifierStackScenePathsKey(
      volume,
      solidScriptInspectorInputValues(parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]),
    );
  }

  /**
   * Starts new generators with the example script.
   *
   * @returns Partial parameters.
   */
  override createParameters(): Record<string, unknown> {
    return { [MODIFIER_STACK_SOLID_SCRIPT_KEY]: solidScriptDocumentDefault() };
  }

  /**
   * Has an edit mode when the script turns on Has Edit Mode.
   *
   * @param parameters Normalized parameters.
   * @returns True for a script with an edit mode.
   */
  override hasEditMode(parameters: Record<string, unknown>): boolean {
    return solidScriptDocumentNormalize(parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]).editMode === true;
  }

  /**
   * Returns the line count shown in the header.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    const lines = solidScriptDocumentNormalize(parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]).blocks.length;
    return `${lines} ${lines === 1 ? 'Line' : 'Lines'}`;
  }

  /**
   * Builds the script's pieces, unless the script may not be used as a
   * generator: then it says so and builds nothing.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Generated units, after the input when Keep input is on.
   */
  override apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const document = solidScriptDocumentNormalize(context.step.parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    const problem = solidScriptDocumentUseProblem(document, 'generator');
    if (!problem) return super.apply(units, context);
    context.report.error = problem;
    return this.passesAuthoredInput(context.step.parameters) ? [...units] : [];
  }

  /**
   * Evaluates the script as a generator.
   *
   * @param parameters Normalized parameters.
   * @param box Generator box in frame coordinates.
   * @param context Evaluation context.
   * @returns Units in CSG order.
   */
  protected generatedUnits(
    parameters: Record<string, unknown>,
    box: THREE.Box3,
    context: ModifierStackContext,
  ): ModifierStackUnit[] {
    return this.scriptUnits(parameters, box, context, {
      ...SOLID_SCRIPT_USE_GENERATOR,
      mode: solidScriptModeLabel(this.pieceOperation(parameters)),
      insertMode: solidScriptBrushModeLabel(this.pieceOperation(parameters)),
    });
  }

  /**
   * Evaluates the script, up to the debugger's step when it is stepped through,
   * and turns its brushes and groups into units.
   *
   * @param parameters Normalized parameters.
   * @param box Box in frame coordinates the script origin is centred in.
   * @param context Evaluation context.
   * @param use Where the script is used and what a modifier receives.
   * @returns Units in CSG order.
   */
  protected scriptUnits(
    parameters: Record<string, unknown>,
    box: THREE.Box3,
    context: ModifierStackContext,
    use: SolidScriptUseFacts,
  ): ModifierStackUnit[] {
    return this.scriptResult(parameters, box, context, use).units;
  }

  /**
   * Evaluates the script like scriptUnits, and also returns the received
   * brushes Input Objects passed on.
   *
   * @param parameters Normalized parameters.
   * @param box Box in frame coordinates the script origin is centred in.
   * @param context Evaluation context.
   * @param use Where the script is used and what a modifier receives.
   * @returns Units in CSG order, and the passed brushes.
   */
  protected scriptResult(
    parameters: Record<string, unknown>,
    box: THREE.Box3,
    context: ModifierStackContext,
    use: SolidScriptUseFacts,
  ): { units: ModifierStackUnit[]; passed: ModifierStackSolidScriptPassed[] } {
    const document = solidScriptDocumentNormalize(parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    const inputs = parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] as Record<string, string>;
    const frame = modifierStackFrame(context.volume, 'volume');
    const layout = modifierStackSolidScriptLayout(
      document,
      parameters['placement'] as ModifierStackSolidScriptPlacement,
      box,
      this.pieceOperation(parameters),
      solidScriptDebugStepLimit(context.volume, context.step.id),
      modifierStackSolidScriptInputsLinked(context, inputs, frame, box),
      use,
      modifierStackSolidScriptBoxValues(context.volume, box),
      { owner: context.volume, stepId: context.step.id },
    );
    if (layout.error) context.report.error = layout.error;
    const scriptToWorld = frame.clone().multiply(layout.placement);
    modifierStackSlidersRecord(
      context.volume,
      context.step.id,
      modifierStackSlidersPlaced(context.step.id, scriptToWorld, modifierStackSlidersOfScript(layout.widgets)),
    );
    modifierStackPathsRecord(context.volume, context.step.id, document, inputs, scriptToWorld);
    modifierStackDrawsRecord(context.volume, context.step.id, layout.widgets, scriptToWorld);
    modifierStackButtonsRecord(context.volume, context.step.id, layout.widgets, scriptToWorld);
    modifierStackAimsRecord(context.volume, context.step.id, layout.widgets, scriptToWorld);
    if (context.ownsGenerated) for (const mesh of layout.meshes) context.meshes?.push({ ...mesh, frame });
    const count = modifierStackSolidScriptBrushCount(layout.nodes);
    if (context.budget.takeCopies(1, count) < count) {
      context.report.error = `Solid budget reached: the script needs ${count} solids.`;
      return { units: [], passed: layout.passed };
    }
    const counter = { next: 0 };
    return {
      units: layout.nodes.map((node) => this.nodeUnit(node, parameters, context, counter)),
      passed: layout.passed,
    };
  }

  /**
   * Turns one brush or group node into a unit; groups hold their members'
   * trees.
   *
   * @param node Node in frame coordinates.
   * @param parameters Normalized parameters.
   * @param context Evaluation context.
   * @param counter Next piece index, shared across the script.
   * @param counter.next Index of the next piece.
   * @returns Unit.
   */
  private nodeUnit(
    node: SolidTreeNode,
    parameters: Record<string, unknown>,
    context: ModifierStackContext,
    counter: { next: number },
  ): ModifierStackUnit {
    if (node.kind === 'brush') {
      const piece = node.brush.clone();
      piece.transformVertices(new THREE.Matrix4().makeTranslation(node.center.x, node.center.y, node.center.z));
      const look = {
        parameters,
        surfaces: modifierStackSolidScriptSurfaces(node),
        caps: null,
        textures:
          node.texture || node.faceTextures
            ? piece.faces.map((_, index) => node.faceTextures?.[index] ?? node.texture)
            : null,
        operation: node.operation,
        smooth: modifierStackSolidScriptSmooth(node, context),
      };
      return this.pieceUnit(piece, counter.next++, context, look);
    }
    const members = node.children.map((child) => this.nodeUnit(child, parameters, context, counter));
    const group = new THREE.Group();
    group.name = node.name;
    markAsSolidCsgGroup(group, node.operation);
    context.staging.add(group);
    for (const member of members) group.add(member.tree);
    group.updateMatrixWorld(true);
    return { tree: group, brushes: members.flatMap((member) => member.brushes), authored: false, origin: null };
  }
}

/**
 * Fills in the Path inputs that follow a Path object, as it lies around the
 * script origin at the box centre, and says which names no Path object has.
 *
 * @param context Evaluation context.
 * @param inputs Stored input values by name.
 * @param frame Matrix from frame coordinates to the world.
 * @param box Box in frame coordinates the script origin is centred in.
 * @returns Input values to run the script with.
 */
function modifierStackSolidScriptInputsLinked(
  context: ModifierStackContext,
  inputs: Record<string, string>,
  frame: THREE.Matrix4,
  box: THREE.Box3,
): Record<string, string> {
  const centre = box.getCenter(new THREE.Vector3());
  const origin = frame.clone().multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z));
  const linked = modifierStackScenePathsLink(context.volume, inputs, origin);
  if (linked.missing.length > 0)
    context.report.error = `No Path object is named ${linked.missing.join(', ')}; its own path is used.`;
  return linked.inputs;
}

/**
 * Counts the brushes of a node list.
 *
 * @param nodes Nodes.
 * @returns Brush count.
 */
function modifierStackSolidScriptBrushCount(nodes: readonly SolidTreeNode[]): number {
  return nodes.reduce(
    (sum, node) => sum + (node.kind === 'brush' ? 1 : modifierStackSolidScriptBrushCount(node.children)),
    0,
  );
}
