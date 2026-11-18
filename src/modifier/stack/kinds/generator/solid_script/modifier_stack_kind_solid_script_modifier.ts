import * as THREE from 'three';
import type { ModifierStackField, ModifierStackUnit } from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackCategory, ModifierStackPoseFollow } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackFrame, modifierStackModelTransform } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackReshapeTransform } from '@/modifier/stack/evaluate/modifier_stack_reshape.js';
import { modifierStackSolidScriptClipUnits } from './modifier_stack_solid_script_clip.js';
import { modifierStackUnitCopy } from '@/modifier/stack/evaluate/modifier_stack_unit_copy.js';
import {
  solidScriptDocumentCreate,
  solidScriptDocumentNormalize,
  solidScriptDocumentUseProblem,
  solidScriptDocumentUsesWith,
} from '@/solid_script/document/solid_script_document.js';
import { SOLID_SCRIPT_EXAMPLE_PEDESTAL } from '@/solid_script/examples/solid_script_examples_basics.js';
import type { SolidScriptUseFacts } from '@/solid_script/language/solid_script_system.js';
import { ModifierStackKindSolidScript, modifierStackSolidScriptFields } from './modifier_stack_kind_solid_script.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND,
} from './modifier_stack_solid_script_keys.js';
import type { ModifierStackSolidScriptPassed } from './modifier_stack_solid_script_layout.js';
import { modifierStackSolidScriptReceivedWrite } from './modifier_stack_solid_script_received.js';

/**
 * Modifier that runs a SolidScript on the brushes it receives, from the brush,
 * mesh or group it is added to. Like a generator, only what the script outputs
 * comes out, placed around their centre: Input Brushes passes the received
 * brushes on. The script reads them as Input.Brushes, Input.Size and the other
 * Input values, and Script.Usage is Modifier.
 */
export class ModifierStackKindSolidScriptModifier extends ModifierStackKindSolidScript {
  override readonly id: string = MODIFIER_STACK_SOLID_SCRIPT_MODIFIER_KIND;
  override readonly label: string = 'SolidScript Modifier';
  override readonly category: ModifierStackCategory = 'shape';
  override readonly description: string =
    'Runs a SolidScript on what it is added to: only what the script outputs comes out, and Input Brushes passes the received brushes on. The script must allow Modifier under Can Be Used As.';
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
   * Outputs what the script builds around the received brushes, which pass on
   * only through Input Brushes, or says why the script may not be used here.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns Units Input Brushes passed on, then the script's.
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
    const centred = (point: THREE.Vector3) => [point.x - centre.x, point.y - centre.y, point.z - centre.z] as const;
    const use: SolidScriptUseFacts = {
      usage: 'Modifier',
      solids: corners.map((list) => list.map(centred)),
      faces: brushes.reduce((sum, brush) => sum + brush.brush.faces.length, 0),
      textures: brushes.map((brush) => {
        const placed = brush.getModelSpaceBrush();
        placed.transformVertices(toFrame);
        return placed.faces.map((face, index) => {
          const points = placed.getFaceVertices(face);
          const middle = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
          const normal = placed.planes[index]!.normal;
          return {
            point: centred(middle),
            normal: [normal.x, normal.y, normal.z] as const,
            texture: brush.getSurfaceTextureId(face.surfaceIndex),
          };
        });
      }),
    };
    const size = box.getSize(new THREE.Vector3());
    modifierStackSolidScriptReceivedWrite(context.volume, context.step.id, { use, box: [size.x, size.y, size.z] });
    const result = this.scriptResult(parameters, box, context, use);
    // Like a generator, only what the script outputs comes out: Input Brushes passes the received brushes on.
    return [...this.passedUnits(units, result.passed, frame, centre, context), ...result.units];
  }

  /**
   * Turns what Input Brushes passed on into units: the first pass moves the
   * received units in place, like Shear; each later pass adds moved copies,
   * like an array.
   *
   * @param units Received units.
   * @param passed Passed brushes in run order; a pass starts again at brush 0.
   * @param frame Frame-to-world matrix.
   * @param context Evaluation context.
   * @returns Units.
   */
  private passedUnits(
    units: readonly ModifierStackUnit[],
    passed: readonly ModifierStackSolidScriptPassed[],
    frame: THREE.Matrix4,
    origin: THREE.Vector3,
    context: ModifierStackContext,
  ): ModifierStackUnit[] {
    const passes = passed.filter((entry) => entry.index === 0);
    const kept = modifierStackSolidScriptClipUnits(units, passes, frame, origin, context);
    const copies = context.budget.takeCopies(
      kept.reduce((sum, unit) => sum + unit.brushes.length, 0),
      passes.length,
    );
    if (copies < passes.length) context.report.error = `Brush budget reached: ${passes.length} passes wanted.`;
    // Without a pass the received brushes are gone; the stack keeps authored ones unless told.
    if (Math.min(copies, passes.length) === 0)
      for (const unit of units) for (const brush of unit.brushes) context.records.hiddenAdd(brush.id);
    const inverse = frame.clone().invert();
    return passes.slice(0, copies).flatMap((pass, index) => {
      const world = frame.clone().multiply(pass.matrix).multiply(inverse);
      const model = modifierStackModelTransform(world, context.solidRoot);
      if (index > 0) {
        const policy = {
          uv: pass.textures,
          readable: pass.readable !== false,
          shiftU: pass.shiftU ?? 0,
          shiftV: pass.shiftV ?? 0,
        };
        return kept.map((unit) => modifierStackUnitCopy(unit, model, index, policy, context));
      }
      if (pass.matrix.equals(new THREE.Matrix4())) return [...kept];
      return kept.map((unit) => ({
        ...unit,
        brushes: unit.brushes.map((brush) => modifierStackReshapeTransform(brush, model, pass.textures)),
        reshaped: unit.authored || unit.reshaped,
      }));
    });
  }
}
