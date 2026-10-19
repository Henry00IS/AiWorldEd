import * as THREE from 'three';
import { modifierBevelDeriveBrush, type ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { ModifierVolumeBevel, type ModifierBevelVolumeSettings } from '@/modifier/volume/modifier_volume_bevel.js';
import {
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
  MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  type ModifierBevelUvFlow,
  type ModifierBevelUvLayout,
  type ModifierBevelUvOwner,
  type ModifierBevelUvPivot,
  type ModifierBevelUvSpace,
} from '@/modifier/volume/modifier_volume_bevel_keys.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';

/** Fields needed to derive one covered box. */
interface OwnerDeriveRequest {
  /** Profile segment count. */
  segments: number;
  /** Curve owner. */
  owner: ModifierBevelUvOwner;
  /** UV flow. */
  flow: ModifierBevelUvFlow;
  /** Meters per tile along U. */
  scaleU: number;
  /** Rotation in degrees. */
  rotation: number;
  /** Rotation pivot. */
  pivot: ModifierBevelUvPivot;
  /** Map axes or brush axes. */
  space: ModifierBevelUvSpace;
  /** UV layout. */
  layout: ModifierBevelUvLayout;
}

/**
 * Builds a covered box and derives it.
 *
 * @param segments Profile segment count.
 * @param owner Curve owner.
 * @param flow UV flow.
 * @param scaleU Meters per tile along U.
 * @param rotation Rotation in degrees.
 * @param pivot Rotation pivot.
 * @returns Instance and derived brush.
 */
export function deriveVolume(
  segments: number,
  owner: ModifierBevelUvOwner,
  flow: ModifierBevelUvFlow,
  scaleU: number,
  rotation: number,
  pivot: ModifierBevelUvPivot,
  space: ModifierBevelUvSpace = MODIFIER_VOLUME_BEVEL_UV_SPACE_WORLD,
  layout: ModifierBevelUvLayout = MODIFIER_VOLUME_BEVEL_UV_LAYOUT_CONTINUE,
): { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush } {
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  applyDeriveSettings(volume, derivePatch({ segments, owner, flow, scaleU, rotation, pivot, space, layout }));
  return deriveOrThrow(boxInstance(), volume);
}

/**
 * Stores one settings patch and refreshes the volume matrix.
 *
 * @param volume Bevel volume.
 * @param patch Fields that replace the defaults.
 */
export function applyDeriveSettings(volume: THREE.Mesh, patch: Partial<ModifierBevelVolumeSettings>): void {
  ModifierVolumeBevel.writeSettings(volume, { ...ModifierVolumeBevel.readSettings(volume), ...patch });
  volume.updateMatrixWorld(true);
}

/**
 * Derives a brush or reports that the volume missed it.
 *
 * @param instance Authored brush.
 * @param volume Bevel volume.
 * @returns Instance and derived brush.
 */
export function deriveOrThrow(
  instance: SolidBrushInstance,
  volume: THREE.Object3D,
): { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush } {
  const derived = modifierBevelDeriveBrush(instance, [volume]);
  if (!derived) throw new Error('expected a derived bevel');
  return { instance, derived };
}

/**
 * Copies a derive request into volume settings fields.
 *
 * @param patch Requested curve and UV placement.
 * @returns Settings fields.
 */
function derivePatch(patch: OwnerDeriveRequest): Partial<ModifierBevelVolumeSettings> {
  return {
    segments: patch.segments,
    uvOwner: patch.owner,
    uvFlow: patch.flow,
    uvLayout: patch.layout,
    uvScaleU: patch.scaleU,
    uvRotation: patch.rotation,
    uvPivot: patch.pivot,
    uvSpace: patch.space,
  };
}

/**
 * Builds a unit box instance.
 *
 * @returns Instance with an identity mesh.
 */
export function boxInstance(): SolidBrushInstance {
  const instance = new SolidBrushInstance('brush-owner', 'Box', SolidBrushFactory.createCenteredBox(1, 1, 1));
  instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh.updateMatrixWorld(true);
  return instance;
}
