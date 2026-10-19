import * as THREE from 'three';
import { SKIP_FACE_PICK_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { ModifierVolumeBevelRegistry } from './modifier_volume_bevel_registry.js';
import { modifierVolumeBlacklistRead, modifierVolumeBlacklistWrite } from './modifier_volume_blacklist.js';
import {
  modifierBevelReadUvPlacement,
  modifierBevelWriteUvPlacement,
  type ModifierBevelUvPlacement,
} from './modifier_volume_bevel_uv_placement.js';
import {
  MODIFIER_VOLUME_BEVEL_ANGLE_KEY,
  MODIFIER_VOLUME_BEVEL_DEFAULT_ANGLE_DEGREES,
  MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE,
  MODIFIER_VOLUME_BEVEL_DEFAULT_SEGMENTS,
  MODIFIER_VOLUME_BEVEL_DISTANCE_KEY,
  MODIFIER_VOLUME_BEVEL_EDGE_KEY,
  MODIFIER_VOLUME_BEVEL_MAX_SEGMENTS,
  MODIFIER_VOLUME_BEVEL_SEGMENTS_KEY,
  MODIFIER_VOLUME_BEVEL_USERDATA_KEY,
  MODIFIER_VOLUME_BEVEL_TEXTURE_KEY,
  MODIFIER_VOLUME_BEVEL_UV_FLOW_KEY,
  MODIFIER_VOLUME_BEVEL_UV_LAYOUT_KEY,
  modifierBevelClampUvFlow,
  modifierBevelClampUvLayout,
  type ModifierBevelUvFlow,
  type ModifierBevelUvLayout,
  type ModifierBevelUvOwner,
  type ModifierBevelUvPivot,
  type ModifierBevelUvSpace,
} from './modifier_volume_bevel_keys.js';

/** Editable chamfer controls stored on a bevel volume. */
export interface ModifierBevelVolumeSettings {
  /** World-space distance along each face. */
  distance: number;
  /** Profile face count. */
  segments: number;
  /** Edges sharper than this many degrees are beveled. */
  angleDegrees: number;
  /** Which authored face generated UVs prefer. */
  uvFlow: ModifierBevelUvFlow;
  /** How generated faces place the texture. */
  uvLayout: ModifierBevelUvLayout;
  /** Texture on generated faces. Empty inherits the parent face. */
  textureId: string;
  /** Scene object ids this volume ignores. */
  blacklist: string[];
  /** Meters of generated bevel covered by one tile along U. */
  uvScaleU: number;
  /** Meters of generated bevel covered by one tile along V. */
  uvScaleV: number;
  /** Shift of generated UVs along U, in meters. */
  uvOffsetU: number;
  /** Shift of generated UVs along V, in meters. */
  uvOffsetV: number;
  /** Rotation of generated UVs, in degrees. */
  uvRotation: number;
  /** Which wall owns a multi-segment curve. */
  uvOwner: ModifierBevelUvOwner;
  /** Point generated textures rotate around. */
  uvPivot: ModifierBevelUvPivot;
  /** Map axes or brush axes. */
  uvSpace: ModifierBevelUvSpace;
}

const VOLUME_COLOR = 0xe67e22;

/**
 * Copies the UV placement fields out of a settings object.
 *
 * @param settings Volume settings.
 * @returns Placement fields.
 */
function modifierBevelPlacementOf(settings: ModifierBevelVolumeSettings): ModifierBevelUvPlacement {
  return {
    uvScaleU: settings.uvScaleU,
    uvScaleV: settings.uvScaleV,
    uvOffsetU: settings.uvOffsetU,
    uvOffsetV: settings.uvOffsetV,
    uvRotation: settings.uvRotation,
    uvOwner: settings.uvOwner,
    uvPivot: settings.uvPivot,
    uvSpace: settings.uvSpace,
  };
}

/**
 * Scene object that chamfers brush edges inside its box. The box is ordinary
 * transformable geometry; derived brush faces are never stored on it.
 */
export class ModifierVolumeBevel {
  /**
   * Returns whether an object is a bevel volume.
   *
   * @param object Candidate object.
   * @returns True when the bevel-volume flag is set.
   */
  static isVolume(object: THREE.Object3D): boolean {
    return object.userData[MODIFIER_VOLUME_BEVEL_USERDATA_KEY] === true;
  }

  /**
   * Reads the chamfer distance, falling back to the default.
   *
   * @param volume Bevel volume.
   * @returns World-space distance, never negative.
   */
  static readDistance(volume: THREE.Object3D): number {
    const stored = volume.userData[MODIFIER_VOLUME_BEVEL_DISTANCE_KEY];
    if (typeof stored !== 'number' || !Number.isFinite(stored)) {
      return MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE;
    }
    return Math.max(0, stored);
  }

  /**
   * Writes the chamfer distance onto the volume.
   *
   * @param volume Bevel volume.
   * @param distance World-space distance.
   */
  static writeDistance(volume: THREE.Object3D, distance: number): void {
    const safe = Number.isFinite(distance) ? Math.max(0, distance) : 0;
    volume.userData[MODIFIER_VOLUME_BEVEL_DISTANCE_KEY] = safe;
  }

  /**
   * Reads the profile face count.
   *
   * @param volume Bevel volume.
   * @returns Integer from 1 through the segment cap.
   */
  static readSegments(volume: THREE.Object3D): number {
    return modifierBevelClampSegments(volume.userData[MODIFIER_VOLUME_BEVEL_SEGMENTS_KEY]);
  }

  /**
   * Writes the profile face count.
   *
   * @param volume Bevel volume.
   * @param segments Requested face count.
   */
  static writeSegments(volume: THREE.Object3D, segments: number): void {
    volume.userData[MODIFIER_VOLUME_BEVEL_SEGMENTS_KEY] = modifierBevelClampSegments(segments);
  }

  /**
   * Reads the sharpness limit in degrees.
   *
   * @param volume Bevel volume.
   * @returns Degrees from 0 through 180.
   */
  static readAngleDegrees(volume: THREE.Object3D): number {
    return modifierBevelClampAngle(volume.userData[MODIFIER_VOLUME_BEVEL_ANGLE_KEY]);
  }

  /**
   * Writes the sharpness limit in degrees.
   *
   * @param volume Bevel volume.
   * @param angleDegrees Requested limit.
   */
  static writeAngleDegrees(volume: THREE.Object3D, angleDegrees: number): void {
    volume.userData[MODIFIER_VOLUME_BEVEL_ANGLE_KEY] = modifierBevelClampAngle(angleDegrees);
  }

  /**
   * Reads the UV flow, falling back to face order.
   *
   * @param volume Bevel volume.
   * @returns Stored flow, or winding when the value is missing.
   */
  static readUvFlow(volume: THREE.Object3D): ModifierBevelUvFlow {
    return modifierBevelClampUvFlow(volume.userData[MODIFIER_VOLUME_BEVEL_UV_FLOW_KEY]);
  }

  /**
   * Writes the UV flow.
   *
   * @param volume Bevel volume.
   * @param flow Requested flow.
   */
  static writeUvFlow(volume: THREE.Object3D, flow: string): void {
    volume.userData[MODIFIER_VOLUME_BEVEL_UV_FLOW_KEY] = modifierBevelClampUvFlow(flow);
  }

  /**
   * Reads the UV layout, falling back to folding the parent texture.
   *
   * @param volume Bevel volume.
   * @returns Stored layout, or continue when the value is missing.
   */
  static readUvLayout(volume: THREE.Object3D): ModifierBevelUvLayout {
    return modifierBevelClampUvLayout(volume.userData[MODIFIER_VOLUME_BEVEL_UV_LAYOUT_KEY]);
  }

  /**
   * Writes the UV layout.
   *
   * @param volume Bevel volume.
   * @param layout Requested layout.
   */
  static writeUvLayout(volume: THREE.Object3D, layout: string): void {
    volume.userData[MODIFIER_VOLUME_BEVEL_UV_LAYOUT_KEY] = modifierBevelClampUvLayout(layout);
  }

  /**
   * Reads the texture used on generated faces.
   *
   * @param volume Bevel volume.
   * @returns Texture id, or an empty string when the parent texture is kept.
   */
  static readTextureId(volume: THREE.Object3D): string {
    const stored = volume.userData[MODIFIER_VOLUME_BEVEL_TEXTURE_KEY];
    return typeof stored === 'string' ? stored : '';
  }

  /**
   * Writes the texture used on generated faces.
   *
   * @param volume Bevel volume.
   * @param textureId Texture id. Empty keeps the parent texture.
   */
  static writeTextureId(volume: THREE.Object3D, textureId: string): void {
    volume.userData[MODIFIER_VOLUME_BEVEL_TEXTURE_KEY] = textureId;
  }

  /**
   * Reads distance, segments, angle, and UV settings together.
   *
   * @param volume Bevel volume.
   * @returns Current settings.
   */
  static readSettings(volume: THREE.Object3D): ModifierBevelVolumeSettings {
    return {
      distance: ModifierVolumeBevel.readDistance(volume),
      segments: ModifierVolumeBevel.readSegments(volume),
      angleDegrees: ModifierVolumeBevel.readAngleDegrees(volume),
      uvFlow: ModifierVolumeBevel.readUvFlow(volume),
      uvLayout: ModifierVolumeBevel.readUvLayout(volume),
      textureId: ModifierVolumeBevel.readTextureId(volume),
      blacklist: modifierVolumeBlacklistRead(volume),
      ...modifierBevelReadUvPlacement(volume),
    };
  }

  /**
   * Writes distance, segments, angle, and UV settings together.
   *
   * @param volume Bevel volume.
   * @param settings Settings to store.
   */
  static writeSettings(volume: THREE.Object3D, settings: ModifierBevelVolumeSettings): void {
    ModifierVolumeBevel.writeDistance(volume, settings.distance);
    ModifierVolumeBevel.writeSegments(volume, settings.segments);
    ModifierVolumeBevel.writeAngleDegrees(volume, settings.angleDegrees);
    ModifierVolumeBevel.writeUvFlow(volume, settings.uvFlow);
    ModifierVolumeBevel.writeUvLayout(volume, settings.uvLayout);
    ModifierVolumeBevel.writeTextureId(volume, settings.textureId);
    modifierVolumeBlacklistWrite(volume, settings.blacklist);
    modifierBevelWriteUvPlacement(volume, modifierBevelPlacementOf(settings));
  }

  /**
   * Creates a unit box volume at the origin.
   *
   * @returns Selectable bevel volume mesh.
   */
  static create(): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ModifierVolumeBevel.createMaterial());
    mesh.name = hierarchyNameAllocator.allocate('Bevel Volume');
    ModifierVolumeBevel.stamp(mesh, MODIFIER_VOLUME_BEVEL_DEFAULT_DISTANCE);
    return mesh;
  }

  /**
   * Marks a mesh as a bevel volume and ensures its outline.
   *
   * @param mesh Volume mesh.
   * @param distance Chamfer distance.
   */
  static stamp(mesh: THREE.Mesh, distance: number): void {
    mesh.userData[MODIFIER_VOLUME_BEVEL_USERDATA_KEY] = true;
    mesh.userData[SKIP_FACE_PICK_USERDATA_KEY] = true;
    ModifierVolumeBevel.writeDistance(mesh, distance);
    ModifierVolumeBevel.writeSegments(mesh, ModifierVolumeBevel.readSegments(mesh));
    ModifierVolumeBevel.writeAngleDegrees(mesh, ModifierVolumeBevel.readAngleDegrees(mesh));
    ModifierVolumeBevel.writeUvFlow(mesh, ModifierVolumeBevel.readUvFlow(mesh));
    ModifierVolumeBevel.writeUvLayout(mesh, ModifierVolumeBevel.readUvLayout(mesh));
    ModifierVolumeBevel.writeTextureId(mesh, ModifierVolumeBevel.readTextureId(mesh));
    ModifierVolumeBevel.ensureOutline(mesh);
    ModifierVolumeBevelRegistry.register(mesh);
  }

  /**
   * Copies bevel identity onto a duplicated mesh.
   *
   * @param source Source volume.
   * @param clone Duplicated mesh.
   */
  static copyOntoClone(source: THREE.Object3D, clone: THREE.Mesh): void {
    if (!ModifierVolumeBevel.isVolume(source)) return;
    ModifierVolumeBevel.stamp(clone, ModifierVolumeBevel.readDistance(source));
    ModifierVolumeBevel.writeSettings(clone, ModifierVolumeBevel.readSettings(source));
  }

  /**
   * Creates the translucent volume material.
   *
   * @returns Basic material.
   */
  private static createMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: VOLUME_COLOR,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Adds an outline child when the volume does not already have one.
   *
   * @param mesh Volume mesh.
   */
  private static ensureOutline(mesh: THREE.Mesh): void {
    if (ModifierVolumeBevel.hasOutline(mesh)) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: VOLUME_COLOR }));
    line.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] = true;
    line.raycast = () => undefined;
    mesh.add(line);
  }

  /**
   * Returns whether the outline child is already present.
   *
   * @param mesh Volume mesh.
   * @returns True when an outline child exists.
   */
  private static hasOutline(mesh: THREE.Mesh): boolean {
    return mesh.children.some((child) => child.userData[MODIFIER_VOLUME_BEVEL_EDGE_KEY] === true);
  }
}

/**
 * Clamps a segment count into the supported integer range.
 *
 * @param value Stored or requested count.
 * @returns Integer from 1 through the segment cap.
 */
function modifierBevelClampSegments(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : MODIFIER_VOLUME_BEVEL_DEFAULT_SEGMENTS;
  return Math.min(MODIFIER_VOLUME_BEVEL_MAX_SEGMENTS, Math.max(1, numeric));
}

/**
 * Clamps a sharpness limit into 0..180 degrees.
 *
 * @param value Stored or requested angle.
 * @returns Degrees.
 */
function modifierBevelClampAngle(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? value : MODIFIER_VOLUME_BEVEL_DEFAULT_ANGLE_DEGREES;
  return Math.min(180, Math.max(0, numeric));
}
