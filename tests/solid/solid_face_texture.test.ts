import { describe, it, expect } from 'vitest';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { AssignSolidFaceTextureCommand } from '../../src/commands/assign_solid_face_texture_command.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../src/texture/texture_id.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';

/**
 * Face-mode solid textures paint individual brush surfaces into the CSG result.
 */
describe('Solid face texture assignment', () => {
  it('paints one brush face without changing other faces', () => {
    const model = new SolidModel('FaceTex');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new AssignSolidFaceTextureCommand(
      [{ model, brushId: brush.id, surfaceIndex: 0 }],
      'folder/face0.png'
    );
    command.execute();
    expect(brush.getSurfaceTextureId(0)).toBe('folder/face0.png');
    expect(brush.getSurfaceTextureId(1)).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    const maps = getFaceTextureMaps(model.getResultMesh());
    expect(maps.some((entry) => entry.mapping.textureId === 'folder/face0.png')).toBe(
      true
    );
    expect(
      maps.some((entry) => entry.mapping.textureId === DEFAULT_CHECKER_TEXTURE_ID)
    ).toBe(true);
  });

  it('undo restores the previous face texture', () => {
    const model = new SolidModel('FaceUndo');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new AssignSolidFaceTextureCommand(
      [{ model, brushId: brush.id, surfaceIndex: 2 }],
      'folder/side.png'
    );
    command.execute();
    command.undo();
    expect(brush.getSurfaceTextureId(2)).toBe(DEFAULT_CHECKER_TEXTURE_ID);
  });
});
