import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { modifierBevelDeriveBrush, type ModifierBevelDerivedBrush } from '@/modifier/bevel/modifier_bevel_derived.js';
import { ModifierBevelSurfaceOverlay } from '@/modifier/compile/modifier_bevel_surface_overlay.js';
import { ModifierVolumeBevel } from '@/modifier/volume/modifier_volume_bevel.js';

describe('bevel surface overlay', () => {
  afterEach(() => {
    ModifierBevelSurfaceOverlay.clearAll();
  });

  it('shows the volume texture on generated regions and the parent texture elsewhere', () => {
    const instance = new SolidBrushInstance('brush-overlay', 'Box', SolidBrushFactory.createCenteredBox(1, 1, 1));
    instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
    instance.mesh.updateMatrixWorld(true);
    const volume = ModifierVolumeBevel.create();
    volume.scale.set(6, 6, 6);
    ModifierVolumeBevel.writeTextureId(volume, 'edges');
    volume.updateMatrixWorld(true);
    const derived = modifierBevelDeriveBrush(instance, [volume]);
    if (!derived) throw new Error('expected a derived brush');
    expect(derived.textureId).toBe('edges');
    ModifierBevelSurfaceOverlay.set(instance.id, derived);
    expect(ModifierBevelSurfaceOverlay.presentedTextureId(instance.id, 'edges', 'parent')).toBe('edges');
    expect(ModifierBevelSurfaceOverlay.presentedTextureId(instance.id, 'parent', 'parent')).toBe('parent');
    expect(ModifierBevelSurfaceOverlay.presentedTextureId(instance.id, 'parent', 'live')).toBe('live');
    ModifierBevelSurfaceOverlay.clear(instance.id);
    expect(ModifierBevelSurfaceOverlay.presentedTextureId(instance.id, 'edges', 'parent')).toBe('parent');
  });

  it('keeps the border texture when its parent face is painted', () => {
    const { instance, derived } = deriveCovered('edges');
    ModifierBevelSurfaceOverlay.set(instance.id, derived);
    const generated = generatedFaceIndex(derived);
    const parent = derived.faces[generated]?.parentSurfaceIndex ?? 0;
    instance.setFaceTextureId(parent, 'wall');
    expect(ModifierBevelSurfaceOverlay.textureForCompiledSurface(instance, generated)).toBe('edges');
    expect(ModifierBevelSurfaceOverlay.textureForCompiledSurface(instance, parent)).toBe('wall');
  });

  it('follows a newly painted parent when the border inherits', () => {
    const { instance, derived } = deriveCovered('');
    ModifierBevelSurfaceOverlay.set(instance.id, derived);
    const generated = generatedFaceIndex(derived);
    const parent = derived.faces[generated]?.parentSurfaceIndex ?? 0;
    instance.setFaceTextureId(parent, 'wall');
    expect(ModifierBevelSurfaceOverlay.textureForCompiledSurface(instance, generated)).toBe('wall');
  });
});

/**
 * Derives a covered bevel with one border texture.
 *
 * @param textureId Volume texture. Empty inherits the parent.
 * @returns Authored brush and derived records.
 */
function deriveCovered(textureId: string): { instance: SolidBrushInstance; derived: ModifierBevelDerivedBrush } {
  const instance = new SolidBrushInstance('brush-overlay-paint', 'Box', SolidBrushFactory.createCenteredBox(1, 1, 1));
  instance.mesh = new THREE.Mesh(new THREE.BufferGeometry());
  instance.mesh.updateMatrixWorld(true);
  const volume = ModifierVolumeBevel.create();
  volume.scale.set(6, 6, 6);
  ModifierVolumeBevel.writeTextureId(volume, textureId);
  volume.updateMatrixWorld(true);
  const derived = modifierBevelDeriveBrush(instance, [volume]);
  if (!derived) throw new Error('expected a derived brush');
  return { instance, derived };
}

/**
 * Returns the first generated face.
 *
 * @param derived Derived brush.
 * @returns Face index.
 */
function generatedFaceIndex(derived: ModifierBevelDerivedBrush): number {
  const index = derived.faces.findIndex((face) => face.chamferEdge || face.cornerFace);
  if (index < 0) throw new Error('expected a generated face');
  return index;
}
