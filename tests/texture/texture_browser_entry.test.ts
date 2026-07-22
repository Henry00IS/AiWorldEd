import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createTextureBrowserEntry,
  revokeTextureBrowserEntry
} from '../../src/texture/texture_browser_entry.js';
import { ensureObjectUrlApis } from './object_url_test_utils.js';

describe('texture_browser_entry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create an entry with a preview object URL from a File', () => {
    ensureObjectUrlApis();
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-preview');
    const file = new File(['pixels'], 'brick_wall.png', { type: 'image/png' });
    const entry = createTextureBrowserEntry(file, 'walls/brick_wall.png');
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(entry.id).toBe('walls/brick_wall.png');
    expect(entry.displayName).toBe('brick_wall');
    expect(entry.fileName).toBe('brick_wall.png');
    expect(entry.relativePath).toBe('walls/brick_wall.png');
    expect(entry.previewObjectUrl).toBe('blob:mock-preview');
    expect(entry.mimeType).toBe('image/png');
    expect(entry.byteSize).toBe(file.size);
    expect(entry.sourceFile).toBe(file);
  });

  it('should revoke the preview object URL', () => {
    ensureObjectUrlApis();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:to-revoke');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    const file = new File(['x'], 'floor.jpg', { type: 'image/jpeg' });
    const entry = createTextureBrowserEntry(file, 'floor.jpg');
    revokeTextureBrowserEntry(entry);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:to-revoke');
  });
});
