import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CurveLibraryExistsError,
  curveLibraryDisplayName,
  curveLibraryFileNameValid,
  curveLibraryFolder,
  curveLibraryPath,
  curveLibraryPathParse,
  curveLibraryPathRead,
  curveLibrarySourceSet,
  type CurveLibrarySource,
} from '@/curve/library/curve_library.js';
import { curveLibraryCopy, curveLibrarySave } from '@/curve/library/curve_library_actions.js';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';

const text = curveFileWrite(
  curveFromPolyline([
    [0, 0],
    [1, 1],
  ]),
  'Ramp',
);

/**
 * Builds an in-memory curve location.
 *
 * @param id Source id.
 * @param files Files by name.
 * @param writable Whether it takes saves.
 * @returns Source.
 */
function memorySource(id: CurveLibrarySource['id'], files: Map<string, string>, writable = true): CurveLibrarySource {
  return {
    id,
    writable: () => writable,
    readOnlyReason: () => (writable ? null : "The room owner's curves are read-only; save to Local instead."),
    list: () => [...files.keys()].map((fileName) => ({ fileName, size: 1, lastModified: 1 })),
    read: async (fileName) => files.get(fileName) ?? '',
    write: async (fileName, value, overwrite) => {
      if (!overwrite && files.has(fileName)) throw new CurveLibraryExistsError(fileName);
      files.set(fileName, value);
    },
  };
}

describe('curve library names', () => {
  it('strips every curve extension whatever its length', () => {
    expect(curveLibraryDisplayName('Profile.aicurve')).toBe('Profile');
    expect(curveLibraryDisplayName('Profile.curve')).toBe('Profile');
    expect(curveLibraryDisplayName('Profile.json')).toBe('Profile');
    expect(curveLibraryDisplayName('Arch.Profile.AICURVE')).toBe('Arch.Profile');
  });

  it('accepts .aicurve and legacy .curve and .json names only', () => {
    for (const name of ['a.aicurve', 'a.curve', 'a.json', 'Ogee 2.aicurve'])
      expect(curveLibraryFileNameValid(name)).toBe(true);
    for (const name of ['.aicurve', '.curve', '.json', ' .curve', 'a.png', 'x/a.aicurve', '.hidden.aicurve', 'a'])
      expect(curveLibraryFileNameValid(name)).toBe(false);
    expect(curveLibraryFileNameValid(`${'a'.repeat(121)}.aicurve`)).toBe(false);
  });

  it('maps Remote and Local curves to virtual paths and back', () => {
    expect(curveLibraryPath('project', 'A.aicurve')).toBe('AiWorldEd/Curves/A.aicurve');
    expect(curveLibraryFolder('remote')).toBe('//Curves/Remote');
    expect(curveLibraryPath('local', 'A.curve')).toBe('//Curves/Local/A.curve');
    expect(curveLibraryPathParse('//Curves/Remote/A.json')).toEqual({ id: 'remote', fileName: 'A.json' });
    expect(curveLibraryPathParse('//Curves/Remote/sub/A.aicurve')).toBeNull();
    expect(curveLibraryPathParse('AiWorldEd/Curves/A.aicurve')).toBeNull();
  });
});

describe('curve library actions', () => {
  afterEach(() => {
    curveLibrarySourceSet('remote', null);
    curveLibrarySourceSet('local', null);
  });

  it('reads virtual paths from the registered source', async () => {
    curveLibrarySourceSet('remote', memorySource('remote', new Map([['A.aicurve', text]])));
    expect(await curveLibraryPathRead('//Curves/Remote/A.aicurve')).toBe(text);
    await expect(curveLibraryPathRead('//Curves/Local/A.aicurve')).rejects.toThrow();
    expect(curveLibraryPathRead('maps/a.aicurve')).toBeNull();
  });

  it('saves without asking when the name is free, and asks Yes/No otherwise', async () => {
    const files = new Map<string, string>();
    const confirm = vi.fn(async () => true);
    expect(await curveLibrarySave(memorySource('project', files), 'A.aicurve', 'one', confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(await curveLibrarySave(memorySource('project', files), 'A.aicurve', 'two', confirm)).toBe(true);
    expect(confirm).toHaveBeenCalledWith('Overwrite Curve?', '"A" already exists in Curves. Overwrite it?');
    expect(files.get('A.aicurve')).toBe('two');
  });

  it('copies between Remote and Local, keeping the target on No', async () => {
    const remote = new Map([['Arch.aicurve', text]]);
    const local = new Map([['Arch.aicurve', 'mine']]);
    const confirm = vi.fn(async () => false);
    expect(
      await curveLibraryCopy(memorySource('remote', remote), memorySource('local', local), 'Arch.aicurve', confirm),
    ).toBe(false);
    expect(local.get('Arch.aicurve')).toBe('mine');
    confirm.mockResolvedValue(true);
    expect(
      await curveLibraryCopy(memorySource('remote', remote), memorySource('local', local), 'Arch.aicurve', confirm),
    ).toBe(true);
    expect(local.get('Arch.aicurve')).toBe(text);
  });

  it('refuses copies into read-only Remote curves and broken curve files', async () => {
    const local = new Map([
      ['Arch.aicurve', text],
      ['Bad.aicurve', '{'],
    ]);
    const viewerRemote = memorySource('remote', new Map(), false);
    await expect(
      curveLibraryCopy(memorySource('local', local), viewerRemote, 'Arch.aicurve', async () => true),
    ).rejects.toThrow("The room owner's curves are read-only; save to Local instead.");
    await expect(
      curveLibraryCopy(
        memorySource('local', local),
        memorySource('remote', new Map()),
        'Bad.aicurve',
        async () => true,
      ),
    ).rejects.toThrow();
  });
});
