import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneFileWriter } from '@/io/scene_file/scene_file_session.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import {
  MODIFIER_STACK_SOLID_SCRIPT_KEY,
  MODIFIER_STACK_SOLID_SCRIPT_KIND,
} from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidModelRegistry } from '@/solid/model/solid_model_registry.js';
import { solidScriptDocumentCreate } from '@/solid_script/document/solid_script_document.js';
import { solidScriptDocumentResourcesWith } from '@/solid_script/document/solid_script_resource.js';
import { solidScriptResourceTextureEmbed } from '@/solid_script/document/solid_script_resource_texture.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { TextureMapCache, setTextureMapCacheForTests } from '@/texture/library/texture_map_cache.js';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { pngHeaderCreate } from '../../collaboration/session/texture_collaboration_fixture.js';
import { mockObjectUrlApis } from '../../texture/library/utils_object_url_test.js';

/**
 * Gives the box a fresh texture library, as another project or browser has.
 *
 * @returns Library.
 */
function libraryFresh(): TextureLibrary {
  const library = new TextureLibrary();
  const cache = new TextureMapCache();
  cache.setLibrary(library);
  setTextureMapCacheForTests(cache);
  return library;
}

/**
 * Builds a world with a Solid Script generator whose cube is painted with a
 * texture resource of the script.
 *
 * @param textureId Id of the kept texture.
 * @returns World and its model.
 */
function worldOf(textureId: string): { world: THREE.Group; model: SolidModel } {
  const script = solidScriptDocumentResourcesWith(
    solidScriptDocumentCreate([
      { command: 'texture', values: { texture: '[$Resources.Brick]' } },
      { command: 'cube', values: {} },
      { command: 'end', values: {} },
    ]),
    [{ name: 'Brick', kind: 'Texture', textureId }],
  );
  const world = new THREE.Group();
  const model = new SolidModel('Texture resource');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  const parameters = { ...first!.parameters, [MODIFIER_STACK_SOLID_SCRIPT_KEY]: script };
  ModifierVolume.write(node, { ...settings, modifiers: [{ ...first!, parameters }, ...rest] });
  return { world, model };
}

/**
 * Lists the textures the faces of a model's output show.
 *
 * @param root Group holding the model.
 * @returns Texture ids.
 */
function texturesShown(root: THREE.Object3D): string[] {
  const [model] = [...SolidModelRegistry.collectUnder(root)];
  root.updateMatrixWorld(true);
  if (!model) return [];
  const compiled = modifierStackCompile(model.getBrushes(), model.root);
  const ids = new Set<string>();
  for (const brush of compiled.instances) {
    ids.add(brush.surfaceTextureId);
    brush.serializeFaceTextureIds().forEach((id) => id && ids.add(id));
  }
  return [...ids];
}

/**
 * Runs a save writer into a file.
 *
 * @param writer Writer the handler passed to the session.
 * @returns Written file.
 */
async function written(writer: SceneFileWriter): Promise<File> {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  await writer(async (chunk) => void parts.push(new Uint8Array(chunk)));
  return new File(parts, 'level.aiworld');
}

beforeEach(() => mockObjectUrlApis());
afterEach(() => {
  setTextureMapCacheForTests(null);
  vi.restoreAllMocks();
});

describe('A texture resource used in the scene', () => {
  it('is saved in the level, so the level shows it without the script file or project', async () => {
    libraryFresh();
    const bytes = pngHeaderCreate(5, 5);
    const id = (await solidScriptResourceTextureEmbed(
      new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      'Brick',
    ))!;
    const { world } = worldOf(id);
    expect(texturesShown(world)).toContain(id);
    const handler = new HandlerSceneIo();
    let file: File | null = null;
    vi.spyOn(handler.getSceneFileSession(), 'save').mockImplementation(async (writer) => {
      file = await written(writer);
      return 'level.aiworld';
    });
    expect(await handler.saveScene(world, null)).toBe(true);
    const library = libraryFresh();
    expect(library.getEntryById(id)).toBeNull();
    vi.spyOn(handler.getSceneFileSession(), 'open').mockResolvedValue({ file: file!, filename: 'level.aiworld' });
    const loaded = new THREE.Group();
    await handler.loadScene(loaded, () => undefined, null);
    expect(library.getEntryById(id)?.sourceFile.size).toBe(bytes.length);
    expect(texturesShown(loaded)).toContain(id);
  });
});
