import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { PanelPropertiesModifierStackSection } from '@/modifier/stack/ui/panel_properties_modifier_stack_section.js';
import {
  ModifierVolume,
  modifierStackNodesActive,
  modifierVolumesActive,
  modifierVolumesAll,
} from '@/modifier/stack/modifier_volume.js';
import { decalProjectorNodeCreate } from '@/decal/volume/decal_projector_node.js';
import { DECAL_DIRECTION_ARROW_USERDATA_KEY } from '@/decal/volume/decal_direction_arrow.js';
import { DecalProjectorSettingsStore } from '@/decal/settings/decal_projector_settings.js';
import { isEditorHelperObject } from '@/utils/mesh_edge_sync.js';
import { buildExportScene, shouldOmitFromExport } from '@/io/scene/builder_export_scene.js';
import { hierarchyDuplicateKindOf } from '@/outliner/hierarchy/hierarchy_duplicate_clone.js';

/**
 * Returns the direction arrow of a projector.
 *
 * @param projector Decal projector.
 * @returns Arrow line segments.
 */
function arrowOf(projector: THREE.Object3D): THREE.LineSegments {
  const arrow = projector.children.find((child) => child.userData[DECAL_DIRECTION_ARROW_USERDATA_KEY] === true);
  if (!(arrow instanceof THREE.LineSegments)) throw new Error('missing arrow');
  return arrow;
}

/**
 * Creates the volume inspector bound to a new decal projector.
 *
 * @param mode Presentation mode.
 * @returns Section root, projector and undo stack.
 */
function decalInspector(mode: 'projector' | 'surfaceMesh') {
  const section = new PanelPropertiesModifierStackSection(
    () => document.createElement('section'),
    (title) => Object.assign(document.createElement('header'), { textContent: title }),
  );
  const stack = new CommandStack(32);
  section.setCommandStack(stack);
  document.body.replaceChildren(section.getElement());
  const projector = decalProjectorNodeCreate(mode);
  new THREE.Group().add(projector);
  section.updateFromObjects([projector]);
  return { section, projector, stack, root: section.getElement() };
}

/**
 * Returns the row element holding a control.
 *
 * @param root Inspector root.
 * @param label Control label.
 * @returns Control, or null.
 */
function control(root: HTMLElement, label: string): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
}

describe('decal projector volume', () => {
  it('is a modifier volume with the decal role that never shapes solids', () => {
    const projector = decalProjectorNodeCreate('projector');
    const world = new THREE.Group().add(projector, ModifierVolume.create({}));
    expect(ModifierVolume.isVolume(projector)).toBe(true);
    expect(ModifierVolume.isDecal(projector)).toBe(true);
    expect(ModifierVolume.shapesSolids(projector)).toBe(false);
    expect(ModifierVolume.read(projector).modifiers.map((step) => step.kind)).toEqual(['decal']);
    expect(modifierVolumesAll(world)).not.toContain(projector);
    expect(modifierVolumesActive(world)).not.toContain(projector);
    expect(modifierStackNodesActive(world)).not.toContain(projector);
    expect(hierarchyDuplicateKindOf(projector)).toBe('volume');
  });

  it('carries an editor-only arrow along local -Y that follows the box and is never picked or exported', () => {
    const projector = decalProjectorNodeCreate('surfaceMesh');
    const arrow = arrowOf(projector);
    const points = arrow.geometry.getAttribute('position');
    const ys = Array.from({ length: points.count }, (_, index) => points.getY(index));
    expect(Math.min(...ys)).toBeLessThan(-0.4);
    expect(Math.max(...ys)).toBeGreaterThan(0.4);
    expect(isEditorHelperObject(arrow)).toBe(true);
    expect(shouldOmitFromExport(arrow)).toBe(true);
    const hits: THREE.Intersection[] = [];
    arrow.raycast(new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0)), hits);
    expect(hits).toEqual([]);
    projector.position.set(3, 1, 0);
    projector.rotation.x = Math.PI / 2;
    projector.updateMatrixWorld(true);
    const tip = new THREE.Vector3(0, -0.42, 0).applyMatrix4(arrow.matrixWorld);
    expect(tip.x).toBeCloseTo(3);
    expect(tip.z).toBeLessThan(0);
    const world = new THREE.Group().add(projector);
    const exported: THREE.Object3D[] = [];
    buildExportScene(world).traverse((object) => exported.push(object));
    expect(exported.length).toBe(1);
  });

  it('keeps a single arrow when duplicated', () => {
    const projector = decalProjectorNodeCreate('projector');
    const clone = projector.clone();
    ModifierVolume.copyOntoClone(projector, clone);
    expect(clone.children.filter((child) => child.userData[DECAL_DIRECTION_ARROW_USERDATA_KEY] === true).length).toBe(
      1,
    );
    expect(DecalProjectorSettingsStore.read(clone)).toEqual(DecalProjectorSettingsStore.read(projector));
  });
});

describe('decal projector inspector', () => {
  it('shows the decal options in the volume panel without capture settings or Add Modifier', () => {
    const { root } = decalInspector('surfaceMesh');
    expect(root.querySelector('header')?.textContent).toContain('Decal Projector');
    for (const label of [
      'Mode',
      'Opacity',
      'Layer',
      'Facing Limit',
      'Lift',
      'Max Lift',
      'First Hit Only',
      'Sticker Unfold',
    ])
      expect(control(root, label), label).not.toBeNull();
    expect(root.textContent).toContain('Image');
    const add = [...root.querySelectorAll<HTMLElement>('button')].find(
      (button) => button.textContent === 'Add Modifier',
    );
    expect(add?.closest<HTMLElement>('div[style*="display: none"]')).toBeTruthy();
    const capture = [...root.querySelectorAll<HTMLElement>('*')].find((element) => element.textContent === 'Capture');
    expect(capture?.closest<HTMLElement>('div[style*="display: none"]')).toBeTruthy();
  });

  it('hides Sticker Unfold in Projector mode', () => {
    const { root } = decalInspector('projector');
    const unfold = control(root, 'Sticker Unfold');
    expect(unfold?.closest<HTMLElement>('[style*="display: none"]')).toBeTruthy();
  });

  it('edits options through the undo stack', () => {
    const { root, projector, stack } = decalInspector('projector');
    const firstHit = control(root, 'First Hit Only');
    if (!firstHit) throw new Error('missing control');
    firstHit.checked = true;
    firstHit.dispatchEvent(new Event('change'));
    expect(DecalProjectorSettingsStore.read(projector).firstHitOnly).toBe(true);
    stack.undo();
    expect(DecalProjectorSettingsStore.read(projector).firstHitOnly).toBe(false);
    stack.redo();
    expect(DecalProjectorSettingsStore.read(projector).firstHitOnly).toBe(true);
  });
});
