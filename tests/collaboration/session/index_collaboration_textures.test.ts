import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TEXTURES_COLLABORATION_PREFETCH_PARALLEL,
  TexturesCollaborationIndexPublisher,
  TexturesCollaborationPrefetch,
} from '@/collaboration/session/index_collaboration_textures.js';
import { texturesCollaborationRevisionParse } from '@/collaboration/session/revision_collaboration_textures.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

/**
 * Builds a library holding textures.
 *
 * @param ids Texture ids.
 * @returns Library.
 */
function libraryOf(ids: readonly string[]): TextureLibrary {
  mockObjectUrlApis();
  const library = new TextureLibrary();
  library.entriesAppend(ids.map((id) => createTextureBrowserEntry(new File([new Uint8Array(8)], id), id)));
  return library;
}

/**
 * Decodes the ids of a notice.
 *
 * @param bytes Notice bytes.
 * @returns Sorted ids.
 */
function idsOf(bytes: Uint8Array): string[] {
  return [...(texturesCollaborationRevisionParse(bytes, 0)?.ids ?? [])].sort();
}

describe('TexturesCollaborationIndexPublisher', () => {
  afterEach(() => vi.useRealTimers());

  it('sends a joining member every texture except the checker and oversized files', () => {
    const library = libraryOf(['a.png', 'b.png']);
    library.entriesAppend([createTextureBrowserEntry(new File([new Uint8Array(64)], 'big.png'), 'big.png')]);
    const sent: [number, Uint8Array][] = [];
    const publisher = new TexturesCollaborationIndexPublisher(
      () => library,
      () => 32,
      (to, bytes) => sent.push([to, bytes]),
    );
    publisher.memberAdd(5);
    expect(sent.map(([to]) => to)).toEqual([5]);
    expect(idsOf(sent[0]![1])).toEqual(['a.png', 'b.png']);
  });

  it('coalesces a burst of library changes into one notice per member', () => {
    vi.useFakeTimers();
    const library = libraryOf(['a.png']);
    const sent: number[] = [];
    const publisher = new TexturesCollaborationIndexPublisher(
      () => library,
      () => 1024,
      (to) => sent.push(to),
    );
    publisher.memberAdd(1);
    publisher.memberAdd(2);
    sent.length = 0;
    for (let index = 0; index < 500; index += 1) {
      library.entriesAppend([createTextureBrowserEntry(new File([new Uint8Array(4)], `${index}.png`), `${index}.png`)]);
      publisher.poll();
    }
    vi.advanceTimersByTime(2500);
    expect(sent.sort()).toEqual([1, 2]);
    publisher.forgetMember(2);
    library.entriesRemove(new Set(['a.png']));
    publisher.poll();
    vi.advanceTimersByTime(2500);
    expect(sent.sort()).toEqual([1, 1, 2]);
    publisher.clear();
  });
});

describe('TexturesCollaborationPrefetch', () => {
  it('waits for the scene, then downloads missing textures a few at a time', async () => {
    const library = libraryOf(['kept.png']);
    const wanted = ['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png'];
    const resolvers: (() => void)[] = [];
    const requested: string[] = [];
    const prefetch = new TexturesCollaborationPrefetch(
      () => library,
      (id) =>
        new Promise<void>((resolve) => {
          requested.push(id);
          resolvers.push(() => {
            library.entriesAppend([createTextureBrowserEntry(new File([new Uint8Array(4)], id), id)]);
            resolve();
          });
        }),
      () => undefined,
    );
    prefetch.indexApply(new Set(['kept.png', ...wanted]));
    expect(requested).toEqual([]);
    prefetch.start();
    expect(requested).toHaveLength(TEXTURES_COLLABORATION_PREFETCH_PARALLEL);
    while (resolvers.length > 0) {
      resolvers.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(requested.sort()).toEqual(wanted);
    expect(library.getEntryById('f.png')).not.toBeNull();
  });

  it('drops textures the owner no longer offers and reports them', () => {
    const library = libraryOf(['kept.png', 'gone.png']);
    const removed: string[] = [];
    const prefetch = new TexturesCollaborationPrefetch(
      () => library,
      async () => undefined,
      (ids) => removed.push(...ids),
    );
    prefetch.indexApply(new Set(['kept.png']));
    expect(removed).toEqual(['gone.png']);
    expect(library.getEntryById('gone.png')).toBeNull();
    expect(library.getEntryById('kept.png')).not.toBeNull();
    expect(prefetch.offeredIds()).toEqual(new Set(['kept.png']));
    prefetch.clear();
    expect(prefetch.offeredIds()).toBeNull();
  });
});
