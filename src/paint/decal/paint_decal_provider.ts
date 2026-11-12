import * as THREE from 'three';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { ModifierVolume, modifierVolumesAll, modifierVolumeVisible } from '@/modifier/stack/modifier_volume.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import { MODIFIER_STACK_KIND_DECAL } from '@/modifier/stack/kinds/decal/modifier_stack_kind_decal.js';
import type { PaintLayerProvider } from '@/paint/scene/paint_scene_system.js';
import type { PaintImageSource } from '@/paint/raster/paint_image.js';
import { paintBlendModeParse } from '@/paint/raster/paint_blend_mode.js';
import type { PaintTileLayer } from '@/paint/raster/paint_tile_raster.js';
import { paintWorldToBrush } from '@/paint/scene/paint_brush_key.js';
import { PAINT_DECAL_FACING_MIN, PaintDecalLayer, type PaintDecalSpec } from './paint_decal_layer.js';

/** One enabled decal of a volume, resolved for the current frame. */
interface PaintDecalVolume {
  /** Stable id: volume uuid and step id. */
  readonly id: string;
  readonly spec: PaintDecalSpec;
  /** World to unit-box transform. */
  readonly worldToDecal: THREE.Matrix4;
  /** World bounds of the box. */
  readonly worldBounds: THREE.Box3;
  /** Settings text for signatures. */
  readonly settings: string;
}

/** The unit box every decal projects through. */
const PAINT_DECAL_UNIT_BOX = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));

/**
 * Supplies decal volumes to the paint system as layers: every enabled Decal
 * modifier of every visible volume reaches the brushes its box overlaps.
 * Volumes are collected once per frame.
 */
export class PaintDecalProvider implements PaintLayerProvider {
  private decals: PaintDecalVolume[] = [];

  /**
   * @param worldObject Returns the current world root.
   * @param images Image source for decal textures.
   */
  constructor(
    private readonly worldObject: () => THREE.Object3D | null,
    private readonly images: PaintImageSource,
  ) {}

  /** Collects the decal volumes of the current world. */
  prepare(): void {
    const world = this.worldObject();
    this.decals = world === null ? [] : paintDecalVolumesCollect(world);
  }

  /**
   * Returns the decals that reach a brush.
   *
   * @param model Owning model.
   * @param brush Brush.
   * @param placement Brush-local to world matrix for a modifier copy of the
   *   brush; the brush's own place when omitted.
   * @returns Layers per face, their brush-local reach and a signature.
   */
  layersFor(
    model: SolidModel,
    brush: SolidBrushInstance,
    placement?: THREE.Matrix4,
  ): { signature: string; layers: (faceIndex: number) => readonly PaintTileLayer[]; bounds: readonly THREE.Box3[] } {
    if (this.decals.length === 0) return PAINT_DECAL_NONE;
    const brushToWorld = placement?.clone() ?? paintWorldToBrush(model, brush, new THREE.Matrix4()).invert();
    const brushBounds = paintBrushLocalBounds(brush);
    if (brushBounds.isEmpty()) return PAINT_DECAL_NONE;
    const worldBounds = brushBounds.clone().applyMatrix4(brushToWorld);
    const reaching: { decal: PaintDecalVolume; brushToDecal: THREE.Matrix4; up: THREE.Vector3; bounds: THREE.Box3 }[] =
      [];
    for (const decal of this.decals) {
      if (!decal.worldBounds.intersectsBox(worldBounds)) continue;
      const brushToDecal = decal.worldToDecal.clone().multiply(brushToWorld);
      const decalToBrush = brushToDecal.clone().invert();
      const bounds = PAINT_DECAL_UNIT_BOX.clone().applyMatrix4(decalToBrush).intersect(brushBounds);
      if (bounds.isEmpty()) continue;
      const up = new THREE.Vector3(0, 1, 0).transformDirection(decalToBrush);
      reaching.push({ decal, brushToDecal, up, bounds });
    }
    if (reaching.length === 0) return PAINT_DECAL_NONE;
    reaching.sort((left, right) => paintDecalCompare(left.decal, right.decal));
    const layers = reaching.map(
      (entry) => new PaintDecalLayer(entry.decal.spec, entry.brushToDecal, entry.up, this.images),
    );
    const signature = reaching
      .map(
        (entry) =>
          `${entry.decal.id}:${entry.decal.settings}:${entry.brushToDecal.elements.map((value) => value.toFixed(5)).join(',')}`,
      )
      .join('|');
    const perFace = new Map<number, readonly PaintTileLayer[]>();
    return {
      signature,
      bounds: reaching.map((entry) => entry.bounds),
      layers: (faceIndex) => {
        let faceLayers = perFace.get(faceIndex);
        if (faceLayers === undefined) {
          const normal = brush.brush.planes[faceIndex]?.normal;
          faceLayers =
            normal === undefined
              ? []
              : layers.filter((_layer, index) => {
                  const up = reaching[index]?.up;
                  return up !== undefined && Math.abs(up.dot(normal) / normal.length()) >= PAINT_DECAL_FACING_MIN;
                });
          perFace.set(faceIndex, faceLayers);
        }
        return faceLayers;
      },
    };
  }
}

/** Result for brushes no decal reaches. */
const PAINT_DECAL_NONE = { signature: '', layers: () => [], bounds: [] } as const;

/**
 * Orders decals for compositing: layers under the paint (negative order) come
 * first from the highest down, because each one slides underneath the ones
 * before it; layers over the paint follow from the lowest up.
 *
 * @param left Decal.
 * @param right Decal.
 * @returns Sort order.
 */
export function paintDecalCompare(
  left: { readonly id: string; readonly spec: PaintDecalSpec },
  right: { readonly id: string; readonly spec: PaintDecalSpec },
): number {
  const leftUnder = left.spec.order < 0;
  const rightUnder = right.spec.order < 0;
  if (leftUnder !== rightUnder) return leftUnder ? -1 : 1;
  const byOrder = leftUnder ? right.spec.order - left.spec.order : left.spec.order - right.spec.order;
  if (byOrder !== 0) return byOrder;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * Lists the enabled decals of every visible, enabled volume under a root.
 *
 * @param root World root.
 * @returns Decals.
 */
export function paintDecalVolumesCollect(root: THREE.Object3D): PaintDecalVolume[] {
  const output: PaintDecalVolume[] = [];
  const kind = modifierStackKindFind(MODIFIER_STACK_KIND_DECAL);
  if (kind === undefined) return output;
  for (const volume of modifierVolumesAll(root)) {
    if (!modifierVolumeVisible(volume)) continue;
    const settings = ModifierVolume.read(volume);
    if (!settings.enabled) continue;
    const local = paintDecalVolumeBox(volume);
    if (local === null) continue;
    volume.updateWorldMatrix(true, false);
    const unitToLocal = new THREE.Matrix4().compose(
      local.getCenter(new THREE.Vector3()),
      new THREE.Quaternion(),
      local.getSize(new THREE.Vector3()),
    );
    const decalToWorld = volume.matrixWorld.clone().multiply(unitToLocal);
    if (Math.abs(decalToWorld.determinant()) < 1e-12) continue;
    const worldToDecal = decalToWorld.clone().invert();
    const worldBounds = PAINT_DECAL_UNIT_BOX.clone().applyMatrix4(decalToWorld);
    for (const step of settings.modifiers) {
      if (!step.enabled || step.kind !== MODIFIER_STACK_KIND_DECAL) continue;
      const parameters = kind.normalizeParameters(step.parameters);
      output.push({
        id: `${volume.uuid}#${step.id}`,
        spec: paintDecalSpecRead(parameters),
        worldToDecal,
        worldBounds,
        settings: JSON.stringify(parameters),
      });
    }
  }
  return output;
}

/**
 * Reads decal settings from normalized parameters.
 *
 * @param parameters Normalized Decal parameters.
 * @returns Spec.
 */
export function paintDecalSpecRead(parameters: Record<string, unknown>): PaintDecalSpec {
  const hex = Number.parseInt(String(parameters['color']).slice(1), 16);
  const color = Number.isFinite(hex) ? hex : 0xffffff;
  return {
    textureId: typeof parameters['texture'] === 'string' ? parameters['texture'] : '',
    color: [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255],
    blend: paintBlendModeParse(parameters['blend']),
    opacity: Number(parameters['opacity']),
    order: Number(parameters['order']),
    edgeFade: Number(parameters['edgeFade']),
    angleFade: parameters['angleFade'] === true,
  };
}

/**
 * Returns a volume's local box.
 *
 * @param volume Volume mesh.
 * @returns Box, or null when the volume has no extent.
 */
function paintDecalVolumeBox(volume: THREE.Object3D): THREE.Box3 | null {
  const geometry = (volume as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  if (geometry === undefined) return null;
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  return box === null || box.isEmpty() ? null : box;
}

/**
 * Returns a brush's bounds in its local space.
 *
 * @param brush Brush.
 * @returns Bounds, empty when the brush has no faces.
 */
function paintBrushLocalBounds(brush: SolidBrushInstance): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const face of brush.brush.faces) {
    for (const vertex of brush.brush.getFaceVertices(face)) bounds.expandByPoint(vertex);
  }
  return bounds;
}
