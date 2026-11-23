import { ModifierStackKind } from '@/modifier/stack/kinds/modifier_stack_kind.js';
import type {
  ModifierStackActionTarget,
  ModifierStackField,
  ModifierStackUnit,
  ModifierStackWidget,
} from '@/modifier/stack/modifier_stack_types.js';
import type { ModifierStackContext } from '@/modifier/stack/evaluate/modifier_stack_context.js';
import { modifierStackParametersCommit } from '@/modifier/stack/modifier_stack_parameters_commit.js';
import { modifierStackPathRecord } from '@/modifier/stack/widgets/modifier_stack_path_record.js';
import { pathAssetDecode, pathAssetEncode } from '@/path/model/path_asset.js';
import { pathFieldSummary } from '@/path/ui/path_field.js';
import { pathInputRow } from '@/path/ui/path_input_row.js';
import { MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY } from '../solid_script/modifier_stack_solid_script_keys.js';
import { modifierStackPathLineSync } from './modifier_stack_path_line.js';
import {
  MODIFIER_STACK_PATH_INPUT,
  MODIFIER_STACK_PATH_KIND,
  modifierStackPathObjectAsset,
  modifierStackPathObjectFrame,
} from './modifier_stack_path_object.js';

/** Hover text of the path row. */
const MODIFIER_STACK_PATH_HINT =
  'The path, drawn and edited in the scene with Edit or the Generator tool; scripts follow it by this object’s name. As text, like an .aipath file: {"points": [[x, y, z], ...], "segments": [{"kind": "Straight"}, ...], "closed": false}, in metres from the object’s centre';

/** Key assistants write a Path object's path under, as text. */
const MODIFIER_STACK_PATH_TEXT_KEY = 'path';

/**
 * A Path object: a path of points and stretches that lives in the scene on its
 * own, saved, undone and shared like any other object. It builds nothing; a
 * script's Path input follows it by name.
 */
export class ModifierStackKindPath extends ModifierStackKind {
  readonly id = MODIFIER_STACK_PATH_KIND;
  readonly label = 'Path';
  readonly category = 'generate' as const;
  readonly description =
    'A path in the scene that scripts can follow by name. Click Edit, or use the Path tool, to draw and shape it.';
  readonly fields: readonly ModifierStackField[] = [
    {
      key: MODIFIER_STACK_PATH_TEXT_KEY,
      label: 'Path',
      type: 'widget',
      default: '',
      hint: MODIFIER_STACK_PATH_HINT,
      widget: (targetOf) => modifierStackPathWidget(targetOf),
      acceptsText: true,
    },
  ];

  /**
   * Keeps the stored path, or one an assistant wrote as text, or the default
   * path.
   *
   * @param input Stored or partial parameters.
   * @returns Normalized parameters.
   */
  override normalizeParameters(input: Record<string, unknown>): Record<string, unknown> {
    const text = input[MODIFIER_STACK_PATH_TEXT_KEY];
    const written = typeof text === 'string' ? pathAssetDecode(text) : null;
    const path = pathAssetEncode(written ?? modifierStackPathObjectAsset(input));
    return { [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: { [MODIFIER_STACK_PATH_INPUT]: path } };
  }

  /**
   * Always edits its path in the scene.
   *
   * @returns True.
   */
  override hasEditMode(): boolean {
    return true;
  }

  /**
   * Returns the point count and length shown in the header.
   *
   * @param parameters Normalized parameters.
   * @returns Summary text.
   */
  override summary(parameters: Record<string, unknown>): string {
    return pathFieldSummary(modifierStackPathObjectAsset(parameters));
  }

  /**
   * Draws the path and keeps it for editing in the scene; builds nothing.
   *
   * @param units Previous output.
   * @param context Evaluation context.
   * @returns The previous output.
   */
  apply(units: readonly ModifierStackUnit[], context: ModifierStackContext): ModifierStackUnit[] {
    const path = modifierStackPathObjectAsset(context.step.parameters);
    const frame = modifierStackPathObjectFrame(context.volume);
    const input = { name: MODIFIER_STACK_PATH_INPUT, label: context.volume.name || this.label };
    modifierStackPathRecord(context.volume, context.step.id, input, path, frame);
    modifierStackPathLineSync(context.volume, path, frame);
    return [...units];
  }
}

/**
 * Builds the inspector row of a Path object's path.
 *
 * @param targetOf Builds what the row acts on.
 * @returns Inspector widget.
 */
function modifierStackPathWidget(
  targetOf: (status: (text: string) => void) => ModifierStackActionTarget | null,
): ModifierStackWidget {
  const row = pathInputRow({
    name: MODIFIER_STACK_PATH_INPUT,
    label: 'Path',
    hint: MODIFIER_STACK_PATH_HINT,
    commit: (text) => {
      const target = targetOf(() => undefined);
      if (!target) return;
      const patch = { [MODIFIER_STACK_SOLID_SCRIPT_INPUTS_KEY]: { [MODIFIER_STACK_PATH_INPUT]: text } };
      modifierStackParametersCommit(target.volume, target.stepId, patch, target.commandStack);
      target.refresh?.();
    },
    placeOf: () => targetOf(() => undefined),
  });
  return {
    element: row.element,
    write: (parameters) => row.write(pathAssetEncode(modifierStackPathObjectAsset(parameters))),
  };
}
