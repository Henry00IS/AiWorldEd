import { afterEach, describe, expect, it, vi } from 'vitest';
import { curveFileRead } from '@/curve/model/curve_file.js';
import { curveEquals, curveFromPolyline } from '@/curve/model/curve_model.js';
import { CURVE_FILE_DEFAULT_NAME, curveFileFromProject, curveFileSave } from '@/curve/ui/curve_file_io.js';
import {
  CurveLibraryExistsError,
  curveLibraryPath,
  curveLibrarySourceSet,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';
import { curveProjectAccessSet } from '@/curve/ui/curve_project_access.js';

const curve = curveFromPolyline([
  [0, 0.3],
  [1, 0.9],
]);

/**
 * Builds an in-memory curve location.
 *
 * @param id Source id.
 * @param files Files by name.
 * @returns Source.
 */
function memorySource(id: CurveLibrarySource['id'], files: Map<string, string>): CurveLibrarySource {
  return {
    id,
    writable: () => true,
    list: () => [...files.keys()].map((fileName) => ({ fileName, size: 1, lastModified: 1 })),
    read: async (fileName) => files.get(fileName) ?? '',
    write: async (fileName, text, overwrite) => {
      if (!overwrite && files.has(fileName)) throw new CurveLibraryExistsError(fileName);
      files.set(fileName, text);
    },
  };
}

describe('curve file saving', () => {
  afterEach(() => {
    curveProjectAccessSet(null);
    curveLibrarySourceSet('remote', null);
    vi.restoreAllMocks();
  });

  it('saves into a curve location as .aicurve', async () => {
    const files = new Map<string, string>();
    const message = await curveFileSave(curve, 'My ramp', memorySource('project', files), async () => true);
    expect(message).toBe('Saved My_ramp.aicurve to Curves');
    const result = curveFileRead(files.get('My_ramp.aicurve') ?? '');
    if ('error' in result) throw new Error(result.error);
    expect(curveEquals(result.curve, curve)).toBe(true);
    expect(result.name).toBe('My ramp');
  });

  it('names an unnamed curve "Profile"', async () => {
    const files = new Map<string, string>();
    await curveFileSave(curve, '  ', memorySource('project', files), async () => true);
    expect([...files.keys()]).toEqual([`${CURVE_FILE_DEFAULT_NAME}.aicurve`]);
  });

  it('asks Yes/No before overwriting and keeps the file on No', async () => {
    const files = new Map([['Profile.aicurve', 'old']]);
    const confirm = vi.fn(async () => false);
    const kept = await curveFileSave(curve, 'Profile', memorySource('local', files), confirm);
    expect(confirm).toHaveBeenCalledWith('Overwrite Curve?', '"Profile" already exists in Local. Overwrite it?');
    expect(kept).toBe('Kept the existing Profile.aicurve in Local');
    expect(files.get('Profile.aicurve')).toBe('old');
    confirm.mockResolvedValue(true);
    expect(await curveFileSave(curve, 'Profile', memorySource('local', files), confirm)).toBe(
      'Saved Profile.aicurve to Local',
    );
    expect(files.get('Profile.aicurve')).not.toBe('old');
  });

  it('downloads the file without a location', async () => {
    const created = vi.fn(() => 'blob:curve');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const message = await curveFileSave(curve, 'ramp', null, async () => true);
    expect(created).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(message).toBe('Downloaded ramp.aicurve');
  });

  it('reads Remote curves by their virtual path without a project', async () => {
    const files = new Map<string, string>();
    await curveFileSave(curve, 'Arch', memorySource('remote', files), async () => true);
    curveLibrarySourceSet('remote', memorySource('remote', files));
    const result = await curveFileFromProject(curveLibraryPath('remote', 'Arch.aicurve'));
    if ('error' in result) throw new Error(result.error);
    expect(curveEquals(result.curve, curve)).toBe(true);
    expect(await curveFileFromProject('AiWorldEd/Curves/Arch.aicurve')).toEqual({ error: 'No project is open.' });
  });
});
