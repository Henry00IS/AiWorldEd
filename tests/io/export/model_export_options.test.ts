import { describe, expect, it } from 'vitest';
import {
  MODEL_EXPORT_FORMATS,
  modelExportFileNameCheck,
  modelExportFolderCheck,
  modelExportSettingsDefault,
  modelExportSettingsParse,
  modelExportTextureMode,
  modelExportTextureModeDefault,
} from '@/io/export/model_export_options.js';

describe('model export names', () => {
  it('adds the extension once and turns spaces into underscores', () => {
    expect(modelExportFileNameCheck('  My Level ', 'fbx')).toEqual({ value: 'My_Level.fbx', error: null });
    expect(modelExportFileNameCheck('level.FBX', 'fbx')).toEqual({ value: 'level.fbx', error: null });
    expect(modelExportFileNameCheck('level.obj', 'fbx').value).toBe('level.obj.fbx');
    expect(modelExportFileNameCheck('Ebene_ü', 'glb').value).toBe('Ebene_ü.glb');
  });

  it('rejects empty, unsafe and reserved file names', () => {
    expect(modelExportFileNameCheck('   ', 'fbx').error).toBe('Enter a file name.');
    expect(modelExportFileNameCheck('a/b', 'fbx').error).toBe('Use letters, digits, _, - and . only.');
    expect(modelExportFileNameCheck('what?', 'fbx').error).toBe('Use letters, digits, _, - and . only.');
    expect(modelExportFileNameCheck('..', 'fbx').error).not.toBeNull();
    expect(modelExportFileNameCheck('.hidden', 'fbx').error).toBe('Names cannot start with a dot.');
    expect(modelExportFileNameCheck('CON', 'obj').error).toBe('"CON" is a reserved name on Windows.');
    expect(modelExportFileNameCheck('x'.repeat(101), 'obj').error).toBe('Use at most 100 characters.');
  });

  it('accepts a blank textures folder as the model folder', () => {
    expect(modelExportFolderCheck('')).toEqual({ value: '', error: null });
    expect(modelExportFolderCheck('   ')).toEqual({ value: '', error: null });
  });

  it('normalizes nested textures folders', () => {
    expect(modelExportFolderCheck('Textures')).toEqual({ value: 'Textures', error: null });
    expect(modelExportFolderCheck(' Maps\\Level 1/ ')).toEqual({ value: 'Maps/Level_1', error: null });
    expect(modelExportFolderCheck('./Textures').error).not.toBeNull();
  });

  it('rejects parent and absolute textures folders', () => {
    expect(modelExportFolderCheck('../Textures').error).toBe('Names cannot be "." or "..".');
    expect(modelExportFolderCheck('Maps/../..').error).toBe('Names cannot be "." or "..".');
    expect(modelExportFolderCheck('/tmp/x').error).toContain('not an absolute path');
    expect(modelExportFolderCheck('C:\\Textures').error).toContain('not an absolute path');
    expect(modelExportFolderCheck('C:Textures').error).toContain('not an absolute path');
  });
});

describe('model export texture modes', () => {
  it('offers each format the modes it can write', () => {
    const modes = Object.fromEntries(MODEL_EXPORT_FORMATS.map((format) => [format.id, format.textureModes]));
    expect(modes).toEqual({
      fbx: ['embedded', 'copy'],
      gltf: ['embedded', 'copy'],
      glb: ['embedded'],
      obj: ['copy'],
    });
  });

  it('defaults Unity FBX exports to Copy Into Directory and every other export to its first mode', () => {
    for (const targetId of ['godot', 'unity', 'blender', 'unreal', 'unknown']) {
      const settings = modelExportSettingsDefault(targetId);
      expect(modelExportTextureMode(settings, 'fbx')).toBe(targetId === 'unity' ? 'copy' : 'embedded');
      expect(modelExportTextureMode(settings, 'gltf')).toBe('embedded');
      expect(modelExportTextureMode(settings, 'glb')).toBe('embedded');
      expect(modelExportTextureMode(settings, 'obj')).toBe('copy');
      expect(modelExportTextureModeDefault(targetId, 'fbx')).toBe(targetId === 'unity' ? 'copy' : 'embedded');
    }
  });

  it('keeps a chosen texture mode whatever the target', () => {
    const settings = modelExportSettingsDefault('unity');
    settings.textureModes.fbx = 'embedded';
    expect(modelExportTextureMode(settings, 'fbx')).toBe('embedded');
    settings.targetId = 'godot';
    settings.textureModes.fbx = 'copy';
    expect(modelExportTextureMode(settings, 'fbx')).toBe('copy');
  });

  it('always embeds GLB textures', () => {
    const settings = modelExportSettingsDefault('godot');
    settings.textureModes.fbx = 'copy';
    expect(modelExportTextureMode(settings, 'glb')).toBe('embedded');
    expect(modelExportTextureMode(settings, 'fbx')).toBe('copy');
  });
});

describe('model export settings parsing', () => {
  it('keeps valid stored values and replaces invalid ones with defaults', () => {
    const defaults = modelExportSettingsDefault('godot');
    const parsed = modelExportSettingsParse(
      JSON.stringify({
        targetId: 'unity',
        format: 'obj',
        fbxEncoding: 'ascii',
        textureModes: { fbx: 'copy', gltf: 'store', obj: 'embedded' },
        texturesFolder: '../up',
        objMaterials: false,
      }),
      defaults,
    );
    expect(parsed).toEqual({
      targetId: 'unity',
      format: 'obj',
      fbxEncoding: 'ascii',
      textureModes: { fbx: 'copy' },
      texturesFolder: 'Textures',
      objMaterials: false,
    });
    expect(modelExportSettingsParse('{not json', defaults)).toEqual(defaults);
    expect(modelExportSettingsParse(JSON.stringify({ texturesFolder: '' }), defaults).texturesFolder).toBe('');
  });
});
