import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FbxImporter } from '@/io/fbx/import/fbx_importer.js';
import type { FbxImportTexture } from '@/io/fbx/import/fbx_import_types.js';
import { GlbImporter } from '@/io/glb/import/glb_importer.js';
import type { GlbImportImage } from '@/io/glb/import/glb_import_types.js';
import type { ModelExportDestination } from '@/io/export/model_export_destination.js';
import type { ModelExportFormat, ModelExportTextureMode } from '@/io/export/model_export_options.js';
import { objMetaLine } from '@/io/obj/obj_meta.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import { EditorSettingsStore } from '@/settings/store/editor_settings_store.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import { getTextureMapCache } from '@/texture/library/texture_map_cache.js';
import type { TextureLibrary } from '@/texture/library/texture_library.js';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { modelExportDialogShow } from '@/ui/export/dialog_model_export.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';
import { bounds, level } from './model_export_world_fixture.js';

/** A 1x1 PNG, the crate texture's original file. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='),
  (character) => character.charCodeAt(0),
);

/** Texture id of the crate texture. */
const CRATE = 'textures/crate.png';

const TARGETS = ['godot', 'unity', 'blender', 'unreal'] as const;

/** Dialog choices of one export. */
interface Choices {
  target: string;
  format: ModelExportFormat;
  encoding?: 'binary' | 'ascii';
  mode?: ModelExportTextureMode;
  /** Textures folder of Copy Into Directory. */
  folder?: string | undefined;
  materials?: boolean;
}

/** @returns The level plus a crate textured with the PNG. */
function texturedLevel(): THREE.Group {
  const world = level();
  const map = new THREE.DataTexture(new Uint8Array([200, 40, 40, 255]), 1, 1);
  map.name = CRATE;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map, name: 'Crate' }));
  crate.name = 'TexturedCrate';
  crate.position.set(3, 0.5, 1);
  world.add(crate);
  world.updateMatrixWorld(true);
  return world;
}

/** @param name Data name. @param value Option value. */
function choose(name: string, value: string): void {
  const select = document.querySelector<HTMLSelectElement>(`[data-model-export="${name}"]`)!;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/** @param name Data name. @param value Text. */
function type(name: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(`[data-model-export="${name}"]`)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Lets pending promises settle. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** @returns Base64 of bytes. */
function base64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

describe('Export dialog to file to editor import', () => {
  let host: HTMLElement;
  let store: EditorSettingsStore;
  /** Files written to the picked folder, by path. */
  let picked: Map<string, Uint8Array>;
  let handler: HandlerSceneIo;
  const statusBar = { setLastAction: vi.fn(), setErrorText: vi.fn() } as unknown as StatusBar;

  beforeEach(() => {
    mockObjectUrlApis();
    getTextureMapCache().setLibrary({
      getEntryById: () => ({ sourceFile: new Blob([PNG], { type: 'image/png' }) }),
      listenerAdd: () => () => undefined,
    } as unknown as TextureLibrary);
    host = document.createElement('div');
    document.body.appendChild(host);
    store = new EditorSettingsStore(new MemorySettingsStorage());
    picked = new Map();
    handler = new HandlerSceneIo();
  });

  afterEach(() => {
    getTextureMapCache().setLibrary(null);
    document.body.replaceChildren();
  });

  /** @returns Destination writing into {@link picked}. */
  function pickedFolder(): ModelExportDestination {
    return {
      label: 'Exports',
      exists: async (path) => picked.has(path),
      write: async (path, blob) => void picked.set(path, new Uint8Array(await blob.arrayBuffer())),
    };
  }

  /**
   * Exports the world through the Export dialog and the export handler.
   *
   * @param world World.
   * @param choices What to pick in the dialog.
   * @returns Reader of the written files by path relative to the model.
   */
  async function exportThroughDialog(world: THREE.Group, choices: Choices) {
    const answer = modelExportDialogShow({
      host,
      store,
      pickFolder: async () => pickedFolder(),
      fileName: 'level',
    });
    choose('target', choices.target);
    choose('format', choices.format);
    if (choices.encoding) choose('encoding', choices.encoding);
    if (choices.materials !== undefined) {
      const box = document.querySelector<HTMLInputElement>('[data-model-export="materials"]')!;
      box.checked = choices.materials;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (choices.mode && document.querySelector('[data-model-export="textures"]') instanceof HTMLSelectElement)
      choose('textures', choices.mode);
    document.querySelector<HTMLButtonElement>('[data-model-export="folder"]')!.click();
    await settle();
    if (choices.mode === 'copy') type('textures-folder', choices.folder ?? 'Textures');
    document.querySelector<HTMLButtonElement>('[data-model-export="export"]')!.click();
    await settle();
    const chosen = await answer;
    expect(chosen).not.toBeNull();
    await handler.exportModel(world, statusBar, chosen!);
    return { answer: chosen!, read: async (path: string): Promise<Uint8Array | null> => picked.get(path) ?? null };
  }

  /**
   * Checks a texture reference of a re-imported model per mode.
   *
   * @param references Paths the model names (relative first).
   * @param choices Dialog choices.
   * @param read Reader of written files.
   */
  async function expectTexture(
    references: readonly string[],
    choices: Choices,
    read: (path: string) => Promise<Uint8Array | null>,
  ): Promise<void> {
    const reference = references[0]!;
    const folder = choices.folder ?? 'Textures';
    expect(reference).toMatch(folder === '' ? /^[\w.-]+\.png$/ : new RegExp(`^${folder}/[\\w.-]+\\.png$`));
    expect(await read(reference)).toEqual(PNG);
  }

  describe.each(TARGETS)('for %s', (targetId) => {
    const expected = (world: THREE.Group) => bounds(world);

    it.each([
      ['binary', 'embedded'],
      ['binary', 'copy'],
      ['ascii', 'copy'],
      ['ascii', 'embedded'],
    ] as const)('FBX %s with %s textures comes back in place, at size and textured', async (encoding, mode) => {
      for (const folder of mode === 'copy' ? ['Textures', ''] : [undefined]) {
        picked.clear();
        const world = texturedLevel();
        const choices: Choices = { target: targetId, format: 'fbx', encoding, mode, folder };
        const { answer, read } = await exportThroughDialog(world, choices);
        expect(answer).toMatchObject({ fileName: 'level.fbx', fbxEncoding: encoding, textureMode: mode });
        let textures: readonly FbxImportTexture[] = [];
        const result = await new FbxImporter().importFromBytes((await read('level.fbx'))!, 'level.fbx', {
          resolve: async (found) => {
            textures = found;
            return { textureIdByImage: new Map(), note: null };
          },
        });
        expect(bounds(result!.root)).toEqual(expected(world));
        expect(textures).toHaveLength(1);
        if (mode === 'embedded') expect(textures[0]!.image?.bytes).toEqual(PNG);
        else await expectTexture(textures[0]!.references, choices, read);
      }
    });

    it.each(['copy'] as const)(
      'OBJ with %s textures comes back by its objmeta, whatever Source Program',
      async (mode) => {
        const world = texturedLevel();
        const choices: Choices = { target: targetId, format: 'obj', mode, folder: '' };
        const { answer, read } = await exportThroughDialog(world, choices);
        expect(answer.textureMode).toBe(mode);
        const text = new TextDecoder().decode((await read('level.obj'))!);
        expect(text.split('\n').slice(0, 4)).toContain(objMetaLine(exportTargetFind(targetId).objSpace));
        const mtl = new TextDecoder().decode((await read('level.mtl'))!);
        const mapKd = /^map_Kd (.+)$/m.exec(mtl)![1]!;
        await expectTexture([mapKd], { ...choices, mode: answer.textureMode }, read);
        // A contradicting Source Program is never asked for.
        const ask = vi.fn(async () => exportTargetFind(targetId === 'blender' ? 'unreal' : 'blender').objSpace);
        const result = await handler.importObjText(text, 'level.obj', statusBar, ask);
        expect(ask).not.toHaveBeenCalled();
        const group = new THREE.Group();
        result!.meshes.forEach((mesh) => group.add(mesh));
        expect(bounds(group)).toEqual(bounds(world));
      },
    );

    it('OBJ without materials writes only the .obj and still comes back in place', async () => {
      const world = texturedLevel();
      const { read } = await exportThroughDialog(world, { target: targetId, format: 'obj', materials: false });
      expect([...picked.keys()]).toEqual(['level.obj']);
      const result = await handler.importObjText(
        new TextDecoder().decode((await read('level.obj'))!),
        'level.obj',
        statusBar,
        async () => null,
      );
      const group = new THREE.Group();
      result!.meshes.forEach((mesh) => group.add(mesh));
      expect(bounds(group)).toEqual(bounds(world));
    });

    it.each([
      ['glb', 'embedded'],
      ['gltf', 'embedded'],
      ['gltf', 'copy'],
    ] as const)('%s with %s textures ignores the target and comes back in place', async (format, mode) => {
      const world = texturedLevel();
      const choices: Choices = { target: targetId, format, mode, folder: '' };
      const { read } = await exportThroughDialog(world, choices);
      let bytes = (await read(`level.${format}`))!;
      if (format === 'gltf') {
        const json = JSON.parse(new TextDecoder().decode(bytes)) as {
          buffers: { uri: string }[];
          images: { uri: string }[];
        };
        if (mode === 'embedded') {
          expect(json.images[0]!.uri.startsWith('data:image/png;base64,')).toBe(true);
        } else {
          await expectTexture([json.images[0]!.uri], choices, read);
          // Inline the side files so the editor importer reads them.
          json.buffers[0]!.uri = `data:application/octet-stream;base64,${base64((await read(json.buffers[0]!.uri))!)}`;
          json.images[0]!.uri = `data:image/png;base64,${base64(PNG)}`;
        }
        bytes = new TextEncoder().encode(JSON.stringify(json));
      }
      let images: readonly GlbImportImage[] = [];
      const result = await new GlbImporter().importFromBytes(bytes, `level.${format}`, {
        resolve: async (found) => {
          images = found;
          return { textureIdByImage: new Map(), note: null };
        },
      });
      expect(bounds(result!.root)).toEqual(bounds(world));
      expect(images.map((image) => image.bytes)).toEqual([PNG]);
    });
  });

  it('offers no Embedded textures for OBJ', async () => {
    void modelExportDialogShow({ host, store, pickFolder: null });
    choose('format', 'obj');
    const modes = [...document.querySelector<HTMLSelectElement>('[data-model-export="textures"]')!.options].map(
      (option) => option.value,
    );
    expect(modes).toEqual(['copy']);
  });

  it('remembers the choices for the next export, and Settings Reset forgets them', async () => {
    const world = texturedLevel();
    await exportThroughDialog(world, { target: 'unreal', format: 'fbx', encoding: 'ascii', mode: 'copy', folder: '' });
    expect(store.getExportSettings()).toMatchObject({
      targetId: 'unreal',
      format: 'fbx',
      fbxEncoding: 'ascii',
      textureModes: { fbx: 'copy' },
      texturesFolder: '',
    });
    const next = modelExportDialogShow({
      host,
      store,
      pickFolder: async () => pickedFolder(),
    });
    expect(document.querySelector<HTMLSelectElement>('[data-model-export="target"]')!.value).toBe('unreal');
    expect(document.querySelector<HTMLSelectElement>('[data-model-export="encoding"]')!.value).toBe('ascii');
    expect(document.querySelector<HTMLInputElement>('[data-model-export="textures-folder"]')!.value).toBe('');
    document.querySelector<HTMLButtonElement>('[data-model-export="cancel"]')!.click();
    expect(await next).toBeNull();
  });
});

describe('OBJ import without a valid objmeta', () => {
  const body = 'o A\nv 0 0 0\nv 1 0 0\nv 0 0 -2\nf 1 2 3\n';
  const statusBar = { setLastAction: vi.fn(), setErrorText: vi.fn() } as unknown as StatusBar;

  it.each([
    ['no comment', body],
    ['malformed JSON', `# objmeta {"v":1,"up":\n${body}`],
    [
      'a comment after the first statement',
      `${body}# objmeta {"v":1,"up":"+z","forward":"+y","right":"+x","unit":1}\n`,
    ],
  ])('falls back to the Source Program with %s', async (_name, text) => {
    const ask = vi.fn(async () => exportTargetFind('blender').space);
    const result = await new HandlerSceneIo().importObjText(text, 'a.obj', statusBar, ask);
    expect(ask).toHaveBeenCalledTimes(1);
    // Read as Blender (Z up): the file's -2 on Z is height.
    const size = new THREE.Box3().setFromObject(result!.meshes[0]!).getSize(new THREE.Vector3());
    expect(size.y).toBeCloseTo(2, 6);
  });

  it('says nothing about an ignored comment in the status bar', async () => {
    const setLastAction = vi.fn();
    const bar = { setLastAction, setErrorText: vi.fn() } as unknown as StatusBar;
    await new HandlerSceneIo().importObjText(`# objmeta [\n${body}`, 'a.obj', bar, async () => null);
    await new HandlerSceneIo().importObjText(
      `# objmeta [\n${body}`,
      'a.obj',
      bar,
      async () => exportTargetFind('godot').space,
    );
    expect(setLastAction).toHaveBeenLastCalledWith('Imported 1 mesh (1 face) from a.obj');
  });

  it('respects a valid comment below other header comments over the Source Program', async () => {
    const text = `# made by hand\n\n# objmeta {"v":1,"up":"+z","forward":"+y","right":"+x","unit":0.5}\n${body}`;
    const ask = vi.fn(async () => exportTargetFind('godot').space);
    const result = await new HandlerSceneIo().importObjText(text, 'a.obj', statusBar, ask);
    expect(ask).not.toHaveBeenCalled();
    const size = new THREE.Box3().setFromObject(result!.meshes[0]!).getSize(new THREE.Vector3());
    // Z up in half meters: 2 units of height are 1 m.
    expect([size.x, size.y, size.z].map((value) => Number(value.toFixed(6)))).toEqual([0.5, 1, 0]);
  });
});
