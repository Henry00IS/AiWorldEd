import type * as THREE from 'three';
import {
  modifierVolumeBlacklistWithoutMissing,
  modifierVolumeTargetRows,
} from '@/modifier/volume/modifier_volume_target_tree.js';
import { ModifierVolumeBlacklistList } from '@/modifier/volume/ui/modifier_volume_blacklist_list.js';
import { modifierStackUiText } from './modifier_stack_ui_style.js';

/**
 * Volume-wide "Affects" list: every object the volume touches, with a checkbox
 * to exclude it from the whole stack.
 */
export class ModifierStackAffects {
  private readonly element: HTMLElement;
  private readonly list = new ModifierVolumeBlacklistList();

  /**
   * Builds the block.
   *
   * @param onExclude Receives the full next exclusion list.
   */
  constructor(private readonly onExclude: (excludedIds: string[]) => void) {
    this.element = document.createElement('div');
    this.element.style.padding = '0 8px 8px';
    const caption = modifierStackUiText('span', 'Affects');
    Object.assign(caption.style, { display: 'block', fontWeight: 'bold', marginBottom: '4px' });
    const list = this.list.getElement();
    Object.assign(list.style, { width: '100%', boxSizing: 'border-box' });
    this.element.append(caption, list);
  }

  /**
   * Returns the block element.
   *
   * @returns Block root.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Fills the list for a volume; ids of objects that left the scene are pruned
   * through the same commit path.
   *
   * @param volume Modifier volume.
   * @param excludedIds Stored exclusions.
   */
  update(volume: THREE.Object3D, excludedIds: readonly string[]): void {
    const root = modifierStackAffectsRoot(volume);
    root.updateMatrixWorld(true);
    const pruned = modifierVolumeBlacklistWithoutMissing(volume, root);
    if (pruned) this.onExclude(pruned);
    this.list.bindToggle((id, checked) =>
      this.onExclude(checked ? excludedIds.filter((entry) => entry !== id) : [...new Set([...excludedIds, id])]),
    );
    this.list.setRows(modifierVolumeTargetRows(volume, root));
  }
}

/**
 * Returns the group the affect list is drawn under.
 *
 * @param object Start object.
 * @returns World group under a scene, or the top object when there is no scene.
 */
function modifierStackAffectsRoot(object: THREE.Object3D): THREE.Object3D {
  let current = object;
  while (current.parent) {
    if (current.parent.type === 'Scene') return current;
    current = current.parent;
  }
  return current;
}
