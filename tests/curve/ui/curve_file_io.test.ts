import { afterEach, describe, expect, it, vi } from 'vitest';
import { curveFileRead } from '@/curve/model/curve_file.js';
import { curveEquals, curveFromPolyline } from '@/curve/model/curve_model.js';
import { curveFileSave } from '@/curve/ui/curve_file_io.js';
import { CURVE_PROJECT_FOLDER, curveProjectAccessSet } from '@/curve/ui/curve_project_access.js';

const curve = curveFromPolyline([
  [0, 0.3],
  [1, 0.9],
]);

describe('curve file saving', () => {
  afterEach(() => {
    curveProjectAccessSet(null);
    vi.restoreAllMocks();
  });

  it('saves into the project curves folder when the project is writable', async () => {
    const written = new Map<string, string>();
    curveProjectAccessSet({
      writable: () => true,
      read: async () => '',
      write: async (path, text) => void written.set(path, text),
    });
    const message = await curveFileSave(curve, 'My ramp');
    const [path, text] = [...written.entries()][0] ?? ['', ''];
    expect(path.startsWith(`${CURVE_PROJECT_FOLDER}/`)).toBe(true);
    expect(message).toContain(path);
    const result = curveFileRead(text);
    if ('error' in result) throw new Error(result.error);
    expect(curveEquals(result.curve, curve)).toBe(true);
    expect(result.name).toBe('My ramp');
  });

  it('downloads the file without a writable project', async () => {
    const created = vi.fn(() => 'blob:curve');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const message = await curveFileSave(curve, 'ramp');
    expect(created).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(message).toContain('.curve');
  });
});
