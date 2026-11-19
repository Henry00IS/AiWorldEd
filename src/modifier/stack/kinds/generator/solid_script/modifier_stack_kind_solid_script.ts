import type { ModifierStackPoseFollow } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import * as THREE from 'three';
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
import { SOLID_SCRIPT_HANDLERS } from '@/solid_script/language/solid_script_machine_calls.js';
import { solidScriptProgramHandle } from '@/solid_script/language/solid_script_program.js';
import { solidScriptDebugStepLimit } from '@/solid_script/debug/solid_script_debug_steps.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackSolidScriptSurfaces } from './modifier_stack_solid_script_surfaces.js';
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
  readonly label: string = 'SolidScript';
  readonly description: string =
    'Builds brushes and meshes from a SolidScript of command lines. Edit Script opens the editor with its command palette; .aiscript files from the project browser can be dropped on the Script row.';
  protected readonly specificFields = modifierStackSolidScriptFields('generator');

  /**
   * Returns valid parameters with the stored script read line by line.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    const script = solidScriptDocumentNormalize(input[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    return {
      ...super.normalizeParameters(input),
      [MODIFIER_STACK_SOLID_SCRIPT_KEY]: script,
      [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: solidScriptInspectorInputValues(
        input[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY],
      ),
    };
  }

  /**
   * Returns that the brushes and their textures follow any move or turn of the
   * node: every face carries a frame-space surface, so the textures turn with
   * the node like a brush turned by the editor's rotate tool.
   *
   * @returns 'rigid'.
   */
  override volumePoseFollow(): ModifierStackPoseFollow | null {
    return 'rigid';
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
   * Runs the script's When Baked blocks, so a bake builds with the inputs they
   * set; a script without one, or whose blocks fail, bakes as it stands.
   *
   * @param parameters Normalized parameters.
   * @returns Parameters with the changed inputs, or null.
   */
  override bakeParameters(parameters: Record<string, unknown>): Record<string, unknown> | null {
    const document = solidScriptDocumentNormalize(parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    if (!document.blocks.some((block) => block.command === SOLID_SCRIPT_HANDLERS.bake)) return null;
    const inputs = solidScriptInspectorInputValues(parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]);
    const handled = solidScriptProgramHandle(document, { kind: 'bake', name: '' }, inputs);
    if (handled.error) return null;
    const next: Record<string, string> = { ...inputs, ...handled.inputs };
    for (const key of handled.removed) delete next[key];
    return { ...parameters, [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: next };
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
    return this.scriptUnits(parameters, box, context, SOLID_SCRIPT_USE_GENERATOR);
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
   * brushes Input Brushes passed on.
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
    const layout = modifierStackSolidScriptLayout(
      solidScriptDocumentNormalize(parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]),
      parameters['placement'] as ModifierStackSolidScriptPlacement,
      box,
      this.pieceOperation(parameters),
      solidScriptDebugStepLimit(context.volume, context.step.id),
      parameters[MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY] as Record<string, string>,
      use,
    );
    if (layout.error) context.report.error = layout.error;
    const frame = modifierStackFrame(context.volume, 'volume');
    if (context.ownsGenerated) for (const mesh of layout.meshes) context.meshes?.push({ ...mesh, frame });
    const count = modifierStackSolidScriptBrushCount(layout.nodes);
    if (context.budget.takeCopies(1, count) < count) {
      context.report.error = `Brush budget reached: the script needs ${count} brushes.`;
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
        smooth: undefined,
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
