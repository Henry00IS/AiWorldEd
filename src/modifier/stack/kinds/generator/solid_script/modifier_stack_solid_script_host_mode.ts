import type * as THREE from 'three';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorOperationRead } from '@/modifier/stack/modifier_generator_operation.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import {
  SOLID_SCRIPT_MODE_DEFAULT,
  solidScriptModeLabel,
  type SolidScriptGroupMode,
} from '@/solid_script/language/solid_script_mode.js';

/**
 * Reads the scene CSG mode of a generator node, brush, group or modifier volume
 * that hosts a SolidScript step.
 *
 * @param node Host object.
 * @returns Mode word, Additive when the host has none.
 */
export function modifierStackSolidScriptHostMode(node: THREE.Object3D): SolidScriptGroupMode {
  if (ModifierVolume.isGenerator(node)) return solidScriptModeLabel(modifierGeneratorOperationRead(node));
  if (isSolidCsgGroup(node)) return solidScriptModeLabel(getSolidGroupOperation(node));
  if (SolidBrushVisual.isBrushObject(node)) return solidScriptModeLabel(SolidBrushVisual.getOperation(node));
  return SOLID_SCRIPT_MODE_DEFAULT;
}
