import type * as THREE from 'three';
import type { InputSelectChoice } from '@/ui/input/input_select.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { isSolidCsgGroup } from '@/solid/model/solid_group.js';
import { modifierVolumeSceneRoot } from '@/modifier/stack/modifier_volume.js';
import { modifierStackIsDerived } from '@/modifier/stack/evaluate/modifier_stack_copy.js';

/**
 * Lists the authored groups and brushes in the volume's scene, indented by
 * depth, for picking cap pieces.
 *
 * @param volume Modifier volume.
 * @returns Choices keyed by object id.
 */
export function modifierStackObjectChoices(volume: THREE.Object3D): InputSelectChoice[] {
  const choices: InputSelectChoice[] = [];
  for (const model of SolidModelRegistry.collectUnder(modifierVolumeSceneRoot(volume)))
    for (const child of model.root.children) modifierStackObjectChoicesAdd(child, 0, choices);
  return choices;
}

/**
 * Adds one group or brush and the groups and brushes under it.
 *
 * @param node Candidate node.
 * @param depth Nesting depth.
 * @param choices Output list.
 */
function modifierStackObjectChoicesAdd(node: THREE.Object3D, depth: number, choices: InputSelectChoice[]): void {
  const brush = SolidBrushVisual.isBrushObject(node);
  if ((!brush && !isSolidCsgGroup(node)) || modifierStackIsDerived(node)) return;
  const label = `${'\u00a0\u00a0'.repeat(depth)}${node.name || (brush ? 'Brush' : 'Group')}`;
  choices.push({ value: node.uuid, label });
  for (const child of node.children) modifierStackObjectChoicesAdd(child, depth + 1, choices);
}
