import { describe, expect, it, vi } from 'vitest';
import { curveFileWrite } from '@/curve/model/curve_file.js';
import { curveFromPolyline } from '@/curve/model/curve_model.js';
import { CurveThumbnails } from '@/curve/ui/curve_thumbnails.js';

describe('curve thumbnails', () => {
  it('reads each file once per modification time and reports when drawing finished', async () => {
    const ready = vi.fn();
    const thumbnails = new CurveThumbnails(ready);
    const text = curveFileWrite(
      curveFromPolyline([
        [0, 0],
        [1, 1],
      ]),
      'ramp',
    );
    const read = vi.fn(async () => text);
    expect(thumbnails.get('a.curve', 1, read)).toBeNull();
    thumbnails.get('a.curve', 1, read);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    expect(read).toHaveBeenCalledTimes(1);
    thumbnails.get('a.curve', 2, read);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('gives no thumbnail for unreadable or invalid files', async () => {
    const ready = vi.fn();
    const thumbnails = new CurveThumbnails(ready);
    thumbnails.get('bad.curve', 1, async () => 'nope');
    thumbnails.get('gone.curve', 1, async () => Promise.reject(new Error('gone')));
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
    expect(thumbnails.get('bad.curve', 1, async () => '')).toBeNull();
  });
});
