import { describe, expect, it, vi } from 'vitest';
import { TexturesCollaborationPublisher } from '@/collaboration/session/publisher_collaboration_textures.js';
import type { TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { pngHeaderCreate } from './texture_collaboration_fixture.js';

describe('TexturesCollaborationPublisher', () => {
  it('tells a member an embedded id it got as missing now resolves to a project file with the same bytes', async () => {
    const hash = 'e'.repeat(64);
    const embeddedId = `embedded:${hash}.png`;
    const entries: TextureBrowserEntry[] = [];
    let revision = 0;
    const library = {
      getEntryById: (id: string) => entries.find((entry) => entry.id === id) ?? null,
      getEntries: () => entries,
      getRevision: () => revision,
      getEntryCount: () => entries.length,
    } as unknown as TextureLibrary;
    const deliver = vi.fn();
    const publisher = new TexturesCollaborationPublisher(
      () => library,
      () => 1 << 20,
      deliver,
    );
    publisher.servedRecord(7, embeddedId, null);
    const file = new File([new Uint8Array(pngHeaderCreate(4, 4))], 'crate.png', { type: 'image/png' });
    entries.push({
      id: 'props/crate.png',
      displayName: 'crate',
      fileName: 'crate.png',
      relativePath: 'props/crate.png',
      previewObjectUrl: 'blob:crate',
      mimeType: 'image/png',
      byteSize: file.size,
      sourceFile: file,
      sha256: hash,
    });
    revision += 1;
    publisher.poll();
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    const [to, changed] = deliver.mock.calls[0] as [number, ReadonlyMap<string, string | null>];
    expect(to).toBe(7);
    expect([...changed.keys()]).toEqual([embeddedId]);
    expect(changed.get(embeddedId)).not.toBeNull();
  });
});
