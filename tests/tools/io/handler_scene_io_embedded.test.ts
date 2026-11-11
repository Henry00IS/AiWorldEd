import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import type { SceneFileHandle, SceneFileWriter } from '@/io/scene_file/scene_file_session.js';
import { ZipReader } from '@/io/zip/zip_reader.js';
import { textureEmbeddedIdOf } from '@/texture/embedded/texture_embedded_id.js';
import { textureEmbeddedAdd } from '@/texture/embedded/texture_embedded_library.js';
import { createTextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { textureLibraryContentFind } from '@/texture/library/texture_library_alias.js';
import { TextureMapCache, setTextureMapCacheForTests } from '@/texture/library/texture_map_cache.js';
import { CONTENT_MESH_TEXTURE_ID_USERDATA_KEY } from '@/texture/uv/content_mesh_texture.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

/**
 * Builds a mesh showing a texture id.
 *
 * @param id Texture id.
 * @returns Mesh.
 */
function meshTextured(id: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.userData[CONTENT_MESH_TEXTURE_ID_USERDATA_KEY] = id;
  return mesh;
}

/**
 * Runs a save writer into a Blob.
 *
 * @param writer Writer the handler passed to the session.
 * @returns Written file.
 */
async function written(writer: SceneFileWriter): Promise<File> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  await writer(async (chunk) => void parts.push(new Uint8Array(chunk)));
  return new File(parts, 'level.aiworld');
}

/**
 * Saves a level holding both textures, opens it again so they read from that
 * file, and leaves only the used one in the scene.
 *
 * @param handler Scene handler.
 * @returns Loaded scene.
 */
async function levelReopenedWithoutUnused(handler: HandlerSceneIo): Promise<THREE.Group> {
  const world = new THREE.Group();
  world.add(meshTextured(used), meshTextured(unused));
  let file: File | null = null;
  vi.spyOn(handler.getSceneFileSession(), 'save').mockImplementation(async (writer) => {
    file = await written(writer);
    return 'level.aiworld';
  });
  await handler.saveScene(world, null);
  vi.spyOn(handler.getSceneFileSession(), 'open').mockResolvedValue({ file: file!, filename: 'level.aiworld' });
  const loaded = new THREE.Group();
  await handler.loadScene(loaded, () => undefined, null);
  handler.setEmbeddedReferences(() => new Set([used]));
  loaded.remove(loaded.children.find((child) => child.userData[CONTENT_MESH_TEXTURE_ID_USERDATA_KEY] === unused)!);
  return loaded;
}

let library: TextureLibrary;
let cache: TextureMapCache;
let used: string;
let unused: string;

beforeEach(async () => {
  mockObjectUrlApis();
  library = new TextureLibrary();
  cache = new TextureMapCache();
  cache.setLibrary(library);
  setTextureMapCacheForTests(cache);
  const usedBytes = pngHeaderCreate(3, 3);
  const unusedBytes = pngHeaderCreate(4, 4);
  used = await textureEmbeddedIdOf(usedBytes, 'image/png');
  unused = await textureEmbeddedIdOf(unusedBytes, 'image/png');
  textureEmbeddedAdd(library, [
    { id: used, name: 'crate', blob: new Blob([new Uint8Array(usedBytes)]) },
    { id: unused, name: 'old', blob: new Blob([new Uint8Array(unusedBytes)]) },
  ]);
});

afterEach(() => {
  setTextureMapCacheForTests(null);
  vi.restoreAllMocks();
});

describe('HandlerSceneIo embedded textures', () => {
  it('saves a zip holding only the embedded textures the level uses', async () => {
    const handler = new HandlerSceneIo();
    const world = new THREE.Group();
    world.add(meshTextured(used), meshTextured('Floor/stone.png'));
    let file: File | null = null;
    vi.spyOn(handler.getSceneFileSession(), 'save').mockImplementation(async (writer) => {
      file = await written(writer);
      return 'level.aiworld';
    });
    expect(await handler.saveScene(world, null)).toBe(true);
    const names = (await ZipReader.open(file!)).list().map((entry) => entry.name);
    expect(names.filter((name) => name.endsWith('.png'))).toEqual([`textures/${used.slice(9)}`]);
  });

  it('refuses to save a level that is too large before asking where to save it', async () => {
    const handler = new HandlerSceneIo();
    const world = new THREE.Group();
    world.add(meshTextured(used));
    Object.defineProperty(library.getEntryById(used)!.sourceFile, 'size', { value: 5 * 2 ** 30 });
    const save = vi.spyOn(handler.getSceneFileSession(), 'save');
    const statusBar = { setErrorText: vi.fn() } as unknown as StatusBar;
    expect(await handler.saveScene(world, statusBar)).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(vi.mocked(statusBar.setErrorText).mock.calls[0]?.[0]).toMatch(/4 GB/);
    expect(document.body.textContent).toContain('Level Too Large');
    expect(document.body.textContent).toContain('project folder instead of embedding them');
    expect(Array.from(document.body.querySelectorAll('button')).map((each) => each.textContent)).toEqual(['OK']);
    document.body.replaceChildren();
  });

  it('loads a saved level anywhere, without a project, with its embedded textures', async () => {
    const handler = new HandlerSceneIo();
    const world = new THREE.Group();
    world.add(meshTextured(used));
    let file: File | null = null;
    vi.spyOn(handler.getSceneFileSession(), 'save').mockImplementation(async (writer) => {
      file = await written(writer);
      return 'level.aiworld';
    });
    await handler.saveScene(world, null);
    library.entriesRemove(new Set([used, unused]));
    vi.spyOn(handler.getSceneFileSession(), 'open').mockResolvedValue({ file: file!, filename: 'level.aiworld' });
    const target = new THREE.Group();
    await handler.loadScene(target, () => undefined, null);
    expect(target.children[0]!.userData[CONTENT_MESH_TEXTURE_ID_USERDATA_KEY]).toBe(used);
    expect(library.getEntryById(used)?.displayName).toBe('crate');
    expect(new Uint8Array(await library.getEntryById(used)!.sourceFile.arrayBuffer())).toEqual(pngHeaderCreate(3, 3));
    expect(library.getEntryById(unused)).toBeNull();
  });

  it('saves the bytes of embedded textures the editor shows from project files with the same content', async () => {
    const bytes = pngHeaderCreate(6, 6);
    const id = await textureEmbeddedIdOf(bytes, 'image/png');
    const file = createTextureBrowserEntry(new File([new Uint8Array(bytes)], 'brick.png'), 'textures/brick.png');
    file.sha256 = id.slice(9, 73);
    library.entriesUpsert([file]);
    expect(textureLibraryContentFind(library, id)).toBe(file);
    const handler = new HandlerSceneIo();
    const world = new THREE.Group();
    world.add(meshTextured(id));
    const setLastAction = vi.fn();
    let saved: File | null = null;
    vi.spyOn(handler.getSceneFileSession(), 'save').mockImplementation(async (writer) => {
      saved = await written(writer);
      return 'level.aiworld';
    });
    await handler.saveScene(world, { setLastAction, setLastSavedInfo: vi.fn() } as unknown as StatusBar);
    expect(setLastAction).toHaveBeenCalledWith('Saved scene to level.aiworld');
    const zip = await ZipReader.open(saved!);
    const entry = zip.list().find((each) => each.name === `textures/${id.slice(9)}`);
    expect(new Uint8Array(await (await zip.read(entry!)).arrayBuffer())).toEqual(bytes);
  });

  it('saves a level opened from the project back to its file without asking where', async () => {
    const handler = new HandlerSceneIo();
    const world = new THREE.Group();
    world.add(meshTextured(used));
    let file: File | null = null;
    vi.spyOn(handler.getSceneFileSession(), 'save').mockImplementationOnce(async (writer) => {
      file = await written(writer);
      return 'level.aiworld';
    });
    await handler.saveScene(world, null);
    const parts: Uint8Array[] = [];
    const handle: SceneFileHandle = {
      name: 'level.aiworld',
      getFile: async () => new File(parts.length > 0 ? (parts as Uint8Array<ArrayBuffer>[]) : [file!], 'level.aiworld'),
      createWritable: async () => {
        parts.length = 0;
        return { write: async (chunk) => void parts.push(new Uint8Array(chunk)), close: async () => undefined };
      },
    };
    const loaded = new THREE.Group();
    expect(await handler.loadSceneFile(file!, loaded, () => undefined, null, 'level.aiworld', handle)).toBe(true);
    const saveAs = vi.spyOn(handler.getSceneFileSession(), 'saveAs');
    const setLastAction = vi.fn();
    expect(await handler.saveScene(loaded, { setLastAction, setLastSavedInfo: vi.fn() } as unknown as StatusBar)).toBe(
      true,
    );
    expect(saveAs).not.toHaveBeenCalled();
    expect(setLastAction).toHaveBeenCalledWith('Saved scene to level.aiworld');
    const names = (await ZipReader.open(await handle.getFile())).list().map((entry) => entry.name);
    expect(names).toContain(`textures/${used.slice(9)}`);
  });

  it('says how many embedded textures a saved level lacks', async () => {
    const handler = new HandlerSceneIo();
    const world = new THREE.Group();
    world.add(meshTextured(`embedded:${'b'.repeat(64)}.png`));
    const setLastAction = vi.fn();
    vi.spyOn(handler.getSceneFileSession(), 'save').mockResolvedValue('level.aiworld');
    await handler.saveScene(world, { setLastAction, setLastSavedInfo: vi.fn() } as unknown as StatusBar);
    expect(setLastAction).toHaveBeenCalledWith('Saved scene to level.aiworld; 1 embedded texture missing');
  });

  it('reports once that the level file changed outside when its textures cannot be read', async () => {
    const handler = new HandlerSceneIo();
    const setErrorText = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    handler.textureReadFailuresWatch({ setErrorText } as unknown as StatusBar);
    const entry = library.getEntryById(used)!;
    entry.sourceFile = { slice: () => ({ arrayBuffer: () => Promise.reject(new Error('NotReadableError')) }) } as never;
    const failed = [
      ...(cache as unknown as { loadFailedListeners: Set<(failed: unknown) => void> }).loadFailedListeners,
    ];
    failed.forEach((listener) => listener(entry));
    failed.forEach((listener) => listener(entry));
    await vi.waitFor(() => expect(setErrorText).toHaveBeenCalledTimes(1));
    expect(setErrorText.mock.calls[0]![0]).toMatch(/was changed or moved outside the editor/);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('reads the textures its level file holds into memory before a save that leaves them out writes over it', async () => {
    const handler = new HandlerSceneIo();
    const world = new THREE.Group();
    world.add(meshTextured(used), meshTextured(unused));
    let file: File | null = null;
    const save = vi.spyOn(handler.getSceneFileSession(), 'save').mockImplementation(async (writer) => {
      file = await written(writer);
      return 'level.aiworld';
    });
    await handler.saveScene(world, null);
    vi.spyOn(handler.getSceneFileSession(), 'open').mockResolvedValue({ file: file!, filename: 'level.aiworld' });
    const imported = await textureEmbeddedIdOf(pngHeaderCreate(5, 5), 'image/png');
    const loaded = new THREE.Group();
    await handler.loadScene(loaded, () => undefined, null);
    textureEmbeddedAdd(library, [
      { id: imported, name: 'prop', blob: new Blob([new Uint8Array(pngHeaderCreate(5, 5))]) },
    ]);
    const fromFile = library.getEntryById(unused)!.sourceFile;
    const fromImport = library.getEntryById(imported)!.sourceFile;
    loaded.remove(loaded.children.find((child) => child.userData[CONTENT_MESH_TEXTURE_ID_USERDATA_KEY] === unused)!);
    let atWrite: { file: Blob; imported: Blob } | null = null;
    save.mockImplementation(async (writer) => {
      await writer(async () => {
        atWrite ??= {
          file: library.getEntryById(unused)!.sourceFile,
          imported: library.getEntryById(imported)!.sourceFile,
        };
      });
      return 'level.aiworld';
    });
    await handler.saveScene(loaded, null);
    expect(atWrite!.file).not.toBe(fromFile);
    expect(new Uint8Array(await atWrite!.file.arrayBuffer())).toEqual(pngHeaderCreate(4, 4));
    expect(atWrite!.imported).toBe(fromImport);
  });

  it('leaves the Texture Browser untouched when Save As is cancelled', async () => {
    const handler = new HandlerSceneIo();
    const loaded = await levelReopenedWithoutUnused(handler);
    const before = [used, unused].map((id) => library.getEntryById(id)?.sourceFile);
    vi.spyOn(handler.getSceneFileSession(), 'saveAs').mockResolvedValue(null);
    expect(await handler.saveScene(loaded, null, true)).toBe(false);
    expect(library.getEntryById(used)?.sourceFile).toBe(before[0]);
    expect(library.getEntryById(unused)?.sourceFile).toBe(before[1]);
  });

  it('leaves the Texture Browser listing the left-out texture when the write fails', async () => {
    const handler = new HandlerSceneIo();
    const loaded = await levelReopenedWithoutUnused(handler);
    vi.spyOn(handler.getSceneFileSession(), 'saveAs').mockImplementation(async (writer) => {
      await writer(async () => Promise.reject(new Error('disk full'))).catch(() => undefined);
      return null;
    });
    expect(await handler.saveScene(loaded, null, true)).toBe(false);
    expect(library.getEntryById(unused)).not.toBeNull();
    expect(library.getEntryById(used)).not.toBeNull();
  });

  it('drops the unused left-out texture once Save As wrote the level', async () => {
    const handler = new HandlerSceneIo();
    const loaded = await levelReopenedWithoutUnused(handler);
    vi.spyOn(handler.getSceneFileSession(), 'saveAs').mockImplementation(async (writer) => {
      await written(writer);
      return 'other.aiworld';
    });
    expect(await handler.saveScene(loaded, null, true)).toBe(true);
    expect(library.getEntryById(unused)).toBeNull();
    expect(library.getEntryById(used)).not.toBeNull();
  });
});
