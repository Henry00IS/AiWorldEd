import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';
import { AssignSolidBrushTextureCommand } from '../../src/commands/assign_solid_brush_texture_command.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../src/texture/texture_id.js';

/**
 * Per-brush surface textures bake into the CSG result, never helper previews.
 */
describe('Solid brush surface textures', () => {
  it('stores texture on the brush and bakes it into the result mesh only', () => {
    const model = new SolidModel('TexSolid');
    const additive = model.addBoxBrush(2, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(1, SolidOperation.Subtractive);
    expect(additive.mesh && subtractive.mesh).toBeTruthy();
    const textureId = 'folder/test_wall.png';
    const command = new AssignSolidBrushTextureCommand(
      [additive.mesh!],
      textureId
    );
    command.execute();
    expect(additive.surfaceTextureId).toBe(textureId);
    expect(subtractive.surfaceTextureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    const maps = getFaceTextureMaps(model.getResultMesh());
    expect(maps.length).toBeGreaterThan(0);
    expect(maps.some((entry) => entry.mapping.textureId === textureId)).toBe(
      true
    );
    const brushMaterial = additive.mesh!.material as THREE.MeshStandardMaterial;
    expect(brushMaterial.map).toBeNull();
    expect(brushMaterial.transparent).toBe(true);
    expect(SolidBrushVisual.isBrushObject(additive.mesh!)).toBe(true);
  });

  it('undo restores prior brush texture ids', () => {
    const model = new SolidModel('UndoTex');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new AssignSolidBrushTextureCommand(
      [brush.mesh!],
      'folder/custom.png'
    );
    command.execute();
    expect(brush.surfaceTextureId).toBe('folder/custom.png');
    command.undo();
    expect(brush.surfaceTextureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
  });

  it('undo restores per-face overrides cleared by whole-brush paint', () => {
    const model = new SolidModel('UndoFaceTex');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.setFaceTextureId(0, 'folder/face0.png');
    brush.setFaceTextureId(2, 'folder/face2.png');
    const command = new AssignSolidBrushTextureCommand(
      [brush.mesh!],
      'folder/whole.png'
    );
    command.execute();
    expect(brush.surfaceTextureId).toBe('folder/whole.png');
    expect(brush.serializeFaceTextureIds().filter(Boolean).length).toBe(0);
    command.undo();
    expect(brush.surfaceTextureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    expect(brush.getSurfaceTextureId(0)).toBe('folder/face0.png');
    expect(brush.getSurfaceTextureId(2)).toBe('folder/face2.png');
  });
});
