import * as THREE from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import { solidScriptInspectorRow } from '@/solid_script/ui/solid_script_inspector_row.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackChoices } from '@/modifier/stack/modifier_stack_fields.js';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierStackKindGeneratorBase } from '@/modifier/stack/kinds/generator/modifier_stack_kind_generator.js';
import {
  solidScriptDocumentDefault,
  solidScriptDocumentNormalize,
} from '@/solid_script/document/solid_script_document.js';
import { solidScriptDebugStepLimit } from '@/solid_script/debug/solid_script_debug_steps.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import {
  modifierStackSolidScriptLayout,
  type ModifierStackSolidScriptPlacement,
} from './modifier_stack_solid_script_layout.js';

/** Kind id of the SolidScript generator. */
export const MODIFIER_STACK_SOLID_SCRIPT_KIND = 'solidScript';

/** Parameter key of the stored script. */
export const MODIFIER_STACK_SOLID_SCRIPT_KEY = 'script';

/**
 * Fields of the SolidScript generator before the shared texture and output
 * ones.
 */
const MODIFIER_STACK_SOLID_SCRIPT_FIELDS: readonly ModifierStackField[] = [
  {
    key: 'scriptFile',
    label: 'Script',
    type: 'widget',
    default: '',
    hint: 'The script this generator runs; edit it in the script editor or drop an .aiscript file on it. Assistants use geometry_script_generator_set.',
    widget: (targetOf) => solidScriptInspectorRow(targetOf, MODIFIER_STACK_SOLID_SCRIPT_KEY),
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
    hint: 'Script Units: metres from the centre of the box, which is the script origin [0, 0, 0]. Fit Box: scaled evenly to fit. Stretch to Box: fills the box.',
  },
];

/**
 * Generator that builds the result of a script of command lines and code: every
 * primitive becomes a convex brush and every difference or intersection a CSG
 * group, rebuilt whenever the script changes.
 */
export class ModifierStackKindSolidScript extends ModifierStackKindGeneratorBase {
  readonly id = MODIFIER_STACK_SOLID_SCRIPT_KIND;
  readonly label = 'SolidScript';
  readonly description =
    'Builds brushes and meshes from a SolidScript of command lines. Edit Script opens the editor with its command palette; .aiscript files from the project browser can be dropped on the Script row.';
  protected readonly specificFields = MODIFIER_STACK_SOLID_SCRIPT_FIELDS;

  /**
   * Returns valid parameters with the stored script read line by line.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    const script = solidScriptDocumentNormalize(input[MODIFIER_STACK_SOLID_SCRIPT_KEY]);
    return { ...super.normalizeParameters(input), [MODIFIER_STACK_SOLID_SCRIPT_KEY]: script };
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
   * Evaluates the script, up to the debugger's step when it is stepped through,
   * and turns its brushes and groups into units.
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
    const layout = modifierStackSolidScriptLayout(
      solidScriptDocumentNormalize(parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]),
      parameters['placement'] as ModifierStackSolidScriptPlacement,
      box,
      this.pieceOperation(parameters),
      solidScriptDebugStepLimit(context.volume, context.step.id),
    );
    if (layout.error) context.report.error = layout.error;
    const frame = modifierStackFrame(context.volume, 'volume');
    for (const mesh of layout.meshes) context.meshes?.push({ ...mesh, frame });
    const count = modifierStackSolidScriptBrushCount(layout.nodes);
    if (context.budget.takeCopies(1, count) < count) {
      context.report.error = `Brush budget reached: the script needs ${count} brushes.`;
      return [];
    }
    const counter = { next: 0 };
    return layout.nodes.map((node) => this.nodeUnit(node, parameters, context, counter));
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
      const look = { parameters, surfaces: null, textures: null, operation: node.operation, smooth: undefined };
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
