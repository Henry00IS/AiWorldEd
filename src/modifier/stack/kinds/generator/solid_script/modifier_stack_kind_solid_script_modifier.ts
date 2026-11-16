import * as THREE from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackCategory, ModifierStackPoseFollow } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackFrame } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  solidScriptDocumentUseProblem,
  solidScriptDocumentUsesWith,
} from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EXAMPLE_PEDESTAL } from '@/solid_script/examples/solid_script_examples_basics.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  ModifierStackKindSolidScript,
  modifierStackSolidScriptFields,
} from './modifier_stack_kind_solid_script.js';

/** Kind id of the SolidScript modifier. */
export const MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND = 'solidScriptModifier';

/**
 * Modifier that runs a SolidScript on the brushes it receives, from the brush,
 * mesh or group it is added to. They pass on as they are; what the script
 * builds is added, placed around their centre. The script reads them as
 * Input.Brushes, Input.Size and the other Input values, copies them with Input
 * Shapes, and Script.Usage is Modifier.
 */
export class ModifierStackKindSolidScriptModifier extends ModifierStackKindSolidScript {
  override readonly id: string = MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND;
  override readonly label: string = 'SolidScript Modifier';
  override readonly category: ModifierStackCategory = 'shape';
  override readonly description: string =
    'Runs a SolidScript on what it is added to: the brushes pass on, and what the script builds around them is added. The script must allow Modifier under Can Be Used As.';
  protected override readonly specificFields = modifierStackSolidScriptFields('modifier');

  /**
   * Returns the script fields, the texture and a visible Operation; the input
   * always passes on, so there is no Keep Input.
   *
   * @returns Field list.
   */
  override get fields(): readonly ModifierStackField[] {
    return super.fields
      .filter((field) => field.key !== 'keepInput')
      .map((field) =>
        field.key === 'operation'
          ? {
              ...field,
              hidden: false,
              hint: 'How the shapes the script builds join what it receives: added, cut out or kept where they overlap.',
            }
          : field,
      );
  }

  /**
   * Starts new modifiers with the Pedestal example, which works both ways.
   *
   * @returns Partial parameters.
   */
  override createParameters(): Record<string, unknown> {
    const document = solidScriptDocumentCreate(SOLID_SCRIPT_EXAMPLE_PEDESTAL, 'Pedestal');
    return {
      [MODIFIER_STACK_SOLID_SCRIPT_KEY]: solidScriptDocumentUsesWith(document, { generator: true, modifier: true }),
    };
  }

  /**
   * Returns that the received brushes always flow on.
   *
   * @returns True.
   */
  override passesAuthoredInput(): boolean {
    return true;
  }

  /**
   * Returns that a moved owner evaluates again, since the script reads what it
   * receives.
   *
   * @returns Null.
   */
  override volumePoseFollow(): ModifierStackPoseFollow | null {
    return null;
  }

  /**
   * Passes the received brushes on and adds what the script builds around them,
   * or says why the script may not be used here.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Received units, then the script's.
   */
  override apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const parameters = context.step.parameters;
    const problem = solidScriptDocumentUseProblem(
      solidScriptDocumentNormalize(parameters[MODIFIER_STACK_SOLID_SCRIPT_KEY]),
      'modifier',
    );
    if (problem) {
      context.report.error = problem;
      return [...units];
    }
    const frame = modifierStackFrame(context.volume, 'volume');
    const toFrame = frame.clone().invert().multiply(context.solidRoot.matrixWorld);
    const brushes = units.flatMap((unit) => unit.brushes);
    const corners = brushes.map((brush) =>
      brush.getModelSpaceBrush().vertices.map((vertex) => vertex.clone().applyMatrix4(toFrame)),
    );
    const box = new THREE.Box3().setFromPoints(corners.flat());
    if (box.isEmpty()) {
      context.report.error = 'The modifier receives no brushes to work on.';
      return [...units];
    }
    const centre = box.getCenter(new THREE.Vector3());
    // Frame space is Y up; script space is Z up.
    const use: SolidScriptUseFacts = {
      usage: 'Modifier',
      solids: corners.map((list) =>
        list.map((point) => [point.x - centre.x, -(point.z - centre.z), point.y - centre.y] as const),
      ),
      faces: brushes.reduce((sum, brush) => sum + brush.brush.faces.length, 0),
    };
    return [...units, ...this.scriptUnits(parameters, box, context, use)];
  }
}
