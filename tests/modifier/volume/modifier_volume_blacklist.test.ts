import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  modifierVolumeBlacklistIgnores,
  modifierVolumeBlacklistRead,
  modifierVolumeBlacklistWrite,
} from '@/modifier/volume/modifier_volume_blacklist.js';
import {
  modifierVolumeBlacklistPrune,
  modifierVolumeTargetRows,
} from '@/modifier/volume/modifier_volume_target_tree.js';
import { modifierBevelVolumesHittingBrush } from '@/modifier/compile/modifier_bevel_compile_list.js';
import { PanelPropertiesBevelVolumeSection } from '@/ui/properties/panel_properties_bevel_volume_section.js';

describe('volume blacklist', () => {
  it('lists touching brushes and their groups, checked until excluded', () => {
    const scene = coveredScene();
    const rows = modifierVolumeTargetRows(scene.volume, scene.world);
    expect(rows.map((row) => row.name)).toEqual(['DefaultModel', 'Group2', 'BrushNear']);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2]);
    expect(rows.every((row) => row.checked)).toBe(true);
    modifierVolumeBlacklistWrite(scene.volume, [scene.far.uuid]);
    const kept = modifierVolumeTargetRows(scene.volume, scene.world);
    expect(kept.map((row) => row.name)).toContain('BrushFar');
    expect(kept.find((row) => row.name === 'BrushFar')?.checked).toBe(false);
  });

  it('ignores a brush when its group is excluded', () => {
    const scene = coveredScene();
    modifierVolumeBlacklistWrite(scene.volume, [scene.group.uuid]);
    expect(modifierVolumeBlacklistIgnores(scene.volume, scene.near)).toBe(true);
    expect(modifierBevelVolumesHittingBrush(scene.nearBrush, [scene.volume])).toEqual([]);
    modifierVolumeBlacklistWrite(scene.volume, []);
    expect(modifierBevelVolumesHittingBrush(scene.nearBrush, [scene.volume])).toHaveLength(1);
  });

  it('drops an exclusion after the object is gone', () => {
    const scene = coveredScene();
    modifierVolumeBlacklistWrite(scene.volume, [scene.far.uuid, 'missing-object']);
    expect(modifierVolumeBlacklistPrune(scene.volume, scene.world)).toBe(true);
    expect(modifierVolumeBlacklistRead(scene.volume)).toEqual([scene.far.uuid]);
  });

  it('omits the unnamed world group under the scene', () => {
    const scene = coveredScene();
    new THREE.Scene().add(scene.world);
    const section = new PanelPropertiesBevelVolumeSection(createPlain, createHeader);
    section.updateFromObjects([scene.volume]);
    expect(checkboxNames(section.getElement())).toEqual(['DefaultModel', 'Group2', 'BrushNear']);
  });

  it('stores an unchecked inspector row and clears it when checked again', () => {
    const scene = coveredScene();
    const section = new PanelPropertiesBevelVolumeSection(createPlain, createHeader);
    section.updateFromObjects([scene.volume]);
    const box = checkboxNamed(section.getElement(), 'BrushNear');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(ModifierVolumeBevel.readSettings(scene.volume).blacklist).toEqual([scene.near.uuid]);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(ModifierVolumeBevel.readSettings(scene.volume).blacklist).toEqual([]);
  });
});

/** Pieces of a scene used by the blacklist tests. */
interface CoveredScene {
  /** Scene root. */
  world: THREE.Group;
  /** Bevel volume. */
  volume: THREE.Mesh;
  /** Group that holds the near brush. */
  group: THREE.Group;
  /** Near brush preview. */
  near: THREE.Object3D;
  /** Distant brush preview. */
  far: THREE.Object3D;
  /** Near brush instance. */
  nearBrush: ReturnType<SolidModel['addBoxBrush']>;
}

/**
 * Builds a model with one covered brush and one distant brush.
 *
 * @returns Scene pieces.
 */
function coveredScene(): CoveredScene {
  const world = new THREE.Group();
  const model = new SolidModel('DefaultModel');
  const group = solidGroup(model, 'Group2');
  const nearBrush = model.addBoxBrush(1, SolidOperation.Additive, group, false);
  const farBrush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  return placeScene(world, model, group, nearBrush, farBrush);
}

/**
 * Creates a solid group under a model.
 *
 * @param model Solid model.
 * @param name Group name.
 * @returns Group.
 */
function solidGroup(model: SolidModel, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  markAsSolidCsgGroup(group);
  model.root.add(group);
  return group;
}

/**
 * Parents the model and volume, and moves the far brush away.
 *
 * @param world Scene root.
 * @param model Solid model.
 * @param group Near group.
 * @param nearBrush Covered brush.
 * @param farBrush Distant brush.
 * @returns Scene pieces.
 */
function placeScene(
  world: THREE.Group,
  model: SolidModel,
  group: THREE.Group,
  nearBrush: ReturnType<SolidModel['addBoxBrush']>,
  farBrush: ReturnType<SolidModel['addBoxBrush']>,
): CoveredScene {
  const near = namedMesh(nearBrush, 'BrushNear');
  const far = namedMesh(farBrush, 'BrushFar');
  far.position.set(20, 0, 0);
  world.add(model.root);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  world.add(volume);
  world.updateMatrixWorld(true);
  return { world, volume, group, near, far, nearBrush };
}

/**
 * Renames a brush preview and returns it.
 *
 * @param brush Brush instance.
 * @param name Display name.
 * @returns Preview mesh.
 */
function namedMesh(brush: { mesh: THREE.Object3D | null }, name: string): THREE.Object3D {
  const mesh = brush.mesh;
  if (!mesh) throw new Error('expected a brush mesh');
  mesh.name = name;
  return mesh;
}

/**
 * Creates an empty element.
 *
 * @returns Div.
 */
function createPlain(): HTMLElement {
  return document.createElement('div');
}

/**
 * Creates a header element.
 *
 * @param title Header text.
 * @returns Header.
 */
function createHeader(title: string): HTMLElement {
  const header = document.createElement('div');
  header.textContent = title;
  return header;
}

/**
 * Finds a checkbox by its accessible name.
 *
 * @param root Section element.
 * @param name Accessible name.
 * @returns Checkbox.
 */
function checkboxNames(root: HTMLElement): string[] {
  const boxes = root.querySelectorAll('input[type="checkbox"]');
  return [...boxes].map((box) => box.getAttribute('aria-label') ?? '');
}

/**
 * Finds a checkbox by its accessible name.
 *
 * @param root Section element.
 * @param name Accessible name.
 * @returns Checkbox.
 */
function checkboxNamed(root: HTMLElement, name: string): HTMLInputElement {
  const box = root.querySelector(`[aria-label="${name}"]`);
  if (!(box instanceof HTMLInputElement)) throw new Error('expected a checkbox');
  return box;
}
