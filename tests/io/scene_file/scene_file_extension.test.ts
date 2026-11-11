import { describe, expect, it } from 'vitest';
import { SCENE_FILE_OPEN_ACCEPT, sceneFileNameWithExtension } from '@/io/scene_file/scene_file_extension.js';
import { projectFileKindOf } from '@/project/fs/project_file_kind.js';
import {
  CURVE_FILE_OPEN_ACCEPT,
  curveFileNameIs,
  curveFileNameOf,
  curveFileNameReadable,
  curveFileTextIs,
} from '@/curve/model/curve_file.js';

describe('level and curve file extensions', () => {
  it('saves levels as .aiworld and still opens legacy .json levels', () => {
    expect(sceneFileNameWithExtension('scene.json')).toBe('scene.aiworld');
    expect(sceneFileNameWithExtension('Start.AIWORLD')).toBe('Start.AIWORLD');
    expect(sceneFileNameWithExtension('noext')).toBe('noext.aiworld');
    expect(SCENE_FILE_OPEN_ACCEPT).toBe('.aiworld,.json');
    expect(projectFileKindOf('a.aiworld')).toBe('scene');
    expect(projectFileKindOf('a.json')).toBe('scene');
  });

  it('saves curves as .aicurve and still opens legacy .curve and .json curves', () => {
    expect(curveFileNameOf('My Ramp')).toBe('My_Ramp.aicurve');
    expect(curveFileNameIs('a.aicurve') && curveFileNameIs('a.curve')).toBe(true);
    expect(curveFileNameIs('a.json')).toBe(false);
    expect(curveFileNameReadable('a.json')).toBe(true);
    expect(curveFileTextIs('{\n  "format": "aiworlded-curve",\n  "version": 1')).toBe(true);
    expect(curveFileTextIs('{"version":1,"objects":[]}')).toBe(false);
    expect(CURVE_FILE_OPEN_ACCEPT).toBe('.aicurve,.curve,.json');
    expect(projectFileKindOf('a.aicurve')).toBe('curve');
    expect(projectFileKindOf('a.curve')).toBe('curve');
  });
});
