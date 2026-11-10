import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerSceneIo } from '@/tools/io/handler_scene_io.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import type { StatusBar } from '@/ui/status/status_bar.js';
import type { ModelExportDialogAnswer } from '@/ui/export/dialog_model_export.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import { objMetaLine } from '@/io/obj/obj_meta.js';
import { ModelExportFolderMemory } from '@/io/export/model_export_folder_memory.js';

const godot = exportTargetFind('godot').space;

describe('SceneIOHandler', () => {
  it('exports as the Export dialog chose and sums it up in the status bar', async () => {
    const setLastAction = vi.fn();
    const statusBar = { setLastAction, setErrorText: vi.fn() } as unknown as StatusBar;
    const written = new Map<string, Blob>();
    const world = new THREE.Group();
    world.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const answer: ModelExportDialogAnswer = {
      format: 'obj',
      target: exportTargetFind('unity'),
      fileName: 'level.obj',
      baseFileName: 'level',
      fbxEncoding: 'binary',
      textureMode: 'copy',
      texturesFolder: 'Textures',
      objMaterials: true,
      destination: {
        label: 'Exports',
        exists: async () => false,
        write: async (path, blob) => void written.set(path, blob),
      },
    };
    await new HandlerSceneIo().exportModel(world, statusBar, answer);
    expect([...written.keys()]).toEqual(['level.obj', 'level.mtl']);
    expect(setLastAction).toHaveBeenLastCalledWith('Exported level.obj to Exports for Unity');
  });

  it('remembers the picked folder of a written export for the next Export dialog', async () => {
    const memory = new ModelExportFolderMemory({ save: async () => undefined, load: async () => null } as never);
    const remember = vi.spyOn(memory, 'remember');
    const world = new THREE.Group();
    world.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const folder = { kind: 'directory', name: 'UnityGame' } as FileSystemDirectoryHandle;
    const answer: ModelExportDialogAnswer = {
      format: 'obj',
      target: exportTargetFind('unity'),
      fileName: 'level.obj',
      baseFileName: 'level',
      fbxEncoding: 'binary',
      textureMode: 'copy',
      texturesFolder: '',
      objMaterials: false,
      destination: { label: 'UnityGame', folder, exists: async () => false, write: async () => undefined },
    };
    const handler = new HandlerSceneIo(memory);
    await handler.exportModel(world, null, answer);
    expect(remember).toHaveBeenCalledWith(folder);
    remember.mockClear();
    const { folder: _picked, ...downloads } = answer.destination;
    await handler.exportModel(world, null, { ...answer, destination: downloads });
    expect(remember).not.toHaveBeenCalled();
  });

  it('counts imported OBJ meshes and faces in singular and plural', () => {
    const setLastAction = vi.fn();
    const statusBar = { setLastAction } as unknown as StatusBar;
    const face = (first: number): string => `f ${first} ${first + 1} ${first + 2}\n`;
    const one = 'o A\nv 0 0 0\nv 1 0 0\nv 0 1 0\n' + face(1);
    new HandlerSceneIo().importObjFromText(one, 'one.obj', statusBar, godot);
    expect(setLastAction).toHaveBeenLastCalledWith('Imported 1 mesh (1 face) from one.obj');
    const two = one + 'o B\nv 0 0 1\nv 1 0 1\nv 0 1 1\n' + face(4) + 'v 1 1 1\nf 5 7 6\n';
    new HandlerSceneIo().importObjFromText(two, 'two.obj', statusBar, godot);
    expect(setLastAction).toHaveBeenLastCalledWith('Imported 2 meshes (3 faces) from two.obj');
  });

  it('asks for the Source Program only for OBJ files without objmeta', async () => {
    const statusBar = { setLastAction: vi.fn(), setErrorText: vi.fn() } as unknown as StatusBar;
    const body = 'o A\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
    const ask = vi.fn(async () => godot);
    const tagged = `${objMetaLine(exportTargetFind('blender').space)}\n${body}`;
    expect((await new HandlerSceneIo().importObjText(tagged, 'a.obj', statusBar, ask))!.axesFromFile).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect((await new HandlerSceneIo().importObjText(body, 'b.obj', statusBar, ask))!.axesFromFile).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
    // Cancelling the Source Program imports nothing.
    expect(await new HandlerSceneIo().importObjText(body, 'b.obj', statusBar, async () => null)).toBeNull();
  });

  let handler: HandlerSceneIo;
  let worldGroup: THREE.Group;

  beforeEach(() => {
    handler = new HandlerSceneIo();
    worldGroup = new THREE.Group();
  });

  it('should serialize scene data with real geometry through SceneSerializer', () => {
    const mesh = createTestMesh('SavedCube');
    mesh.position.set(1, 2, 3);
    worldGroup.add(mesh);
    const serializer = new SceneSerializer();
    const sceneData = serializer.serialize(worldGroup);
    expect(sceneData.version).toBe(4);
    expect(sceneData.objects.length).toBe(1);
    expect(sceneData.objects[0]!.name).toBe('SavedCube');
    expect(sceneData.objects[0]!.position.x).toBe(1);
    expect(sceneData.objects[0]!.position.y).toBe(2);
    expect(sceneData.objects[0]!.position.z).toBe(3);
  });

  it('should handle empty group serialization correctly', () => {
    const serializer = new SceneSerializer();
    const sceneData = serializer.serialize(worldGroup);
    expect(sceneData.objects.length).toBe(0);
  });

  it('should deserialize scene data and restore objects correctly', () => {
    const mesh = createTestMesh('RestoredMesh');
    mesh.position.set(5, 10, 15);
    worldGroup.add(mesh);
    const serializer = new SceneSerializer();
    const data = serializer.serialize(worldGroup);
    const target = new THREE.Group();
    const deserializer = new SceneDeserializer();
    deserializer.deserialize(data, target);
    expect(target.children.length).toBe(1);
    expect(target.children[0]!.name).toBe('RestoredMesh');
    expect(target.children[0]!.position.x).toBeCloseTo(5);
    expect(target.children[0]!.position.y).toBeCloseTo(10);
    expect(target.children[0]!.position.z).toBeCloseTo(15);
  });

  it('should report whether saveScene wrote the file', async () => {
    const saveJson = vi.spyOn(handler.getSceneFileSession(), 'save');
    saveJson.mockResolvedValueOnce('scene.json');
    await expect(handler.saveScene(worldGroup, null)).resolves.toBe(true);
    saveJson.mockResolvedValueOnce(null);
    await expect(handler.saveScene(worldGroup, null)).resolves.toBe(false);
    saveJson.mockRejectedValueOnce(new Error('disk full'));
    await expect(handler.saveScene(worldGroup, null)).resolves.toBe(false);
    saveJson.mockRestore();
  });

  it('should route Save As to the always-prompting path and forget the file on New', async () => {
    const session = handler.getSceneFileSession();
    const save = vi.spyOn(session, 'save').mockResolvedValue('a.json');
    const saveAs = vi.spyOn(session, 'saveAs').mockResolvedValue('b.json');
    await expect(handler.saveScene(worldGroup, null, true)).resolves.toBe(true);
    expect(saveAs).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    const forget = vi.spyOn(session, 'forget');
    handler.clearScene(worldGroup, null);
    expect(forget).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('should round-trip save payload through JSON parse', () => {
    const mesh = createTestMesh('RoundTrip');
    mesh.position.set(3, 4, 5);
    worldGroup.add(mesh);
    const serializer = new SceneSerializer();
    const json = JSON.stringify(serializer.serialize(worldGroup));
    const target = new THREE.Group();
    const deserializer = new SceneDeserializer();
    deserializer.deserialize(JSON.parse(json), target);
    expect(target.children[0]!.name).toBe('RoundTrip');
    expect(target.children[0]!.position.x).toBeCloseTo(3);
  });

  it('should load scene with null status bar without aborting', async () => {
    const mesh = createTestMesh('LoadNoStatus');
    worldGroup.add(mesh);
    const serializer = new SceneSerializer();
    const json = JSON.stringify(serializer.serialize(worldGroup));
    vi.spyOn(handler.getSceneFileSession(), 'open').mockResolvedValue({
      file: new File([json], 'loaded.json'),
      filename: 'loaded.json',
    });
    const target = new THREE.Group();
    let loaded = false;
    await handler.loadScene(
      target,
      () => {
        loaded = true;
      },
      null,
    );
    expect(loaded).toBe(true);
    expect(target.children.length).toBe(1);
    expect(target.children[0]!.name).toBe('LoadNoStatus');
  });

  it('exports a GLB of real meshes as one file', async () => {
    worldGroup.add(createTestMesh('ExportMe'));
    const written = new Map<string, Blob>();
    await handler.exportModel(worldGroup, null, {
      format: 'glb',
      target: exportTargetFind('godot'),
      fileName: 'scene.glb',
      baseFileName: 'scene',
      fbxEncoding: 'binary',
      textureMode: 'embedded',
      texturesFolder: '',
      objMaterials: true,
      destination: {
        label: 'Exports',
        exists: async () => false,
        write: async (path, blob) => void written.set(path, blob),
      },
    });
    expect([...written.keys()]).toEqual(['scene.glb']);
    const buffer = await written.get('scene.glb')!.arrayBuffer();
    expect(new DataView(buffer).getUint32(0, true)).toBe(0x46546c67);
  });

  it('imports a VMF document into a solid model with brushes', async () => {
    const vmf = buildSimpleBoxVmf();
    const result = await handler.importVmfFromText(vmf, 'room_01.vmf', null);
    expect(result).not.toBeNull();
    expect(result!.model.root.name).toBe('room_01');
    expect(result!.importedBrushCount).toBe(1);
    expect(result!.model.getBrushCount()).toBe(1);
    expect(result!.model.getBrushes()[0]!.brush.faces.length).toBe(6);
  });

  it('returns null when the VMF has no importable brushes', async () => {
    const emptyWorld = `
world
{
	"id" "1"
	"classname" "worldspawn"
}
`;
    const result = await handler.importVmfFromText(emptyWorld, 'empty.vmf', null);
    expect(result).toBeNull();
  });

  it('loads a VMF via the file dialog path', async () => {
    const fileDialog = (
      handler as unknown as {
        fileDialogManager: {
          loadTextFile: () => Promise<{ text: string; filename: string } | null>;
        };
      }
    ).fileDialogManager;
    vi.spyOn(fileDialog, 'loadTextFile').mockResolvedValue({
      text: buildSimpleBoxVmf(),
      filename: 'dialog_map.vmf',
    });
    const result = await handler.importVmf(null);
    expect(result).not.toBeNull();
    expect(result!.model.root.name).toBe('dialog_map');
    expect(result!.importedBrushCount).toBe(1);
  });
});

/**
 * Minimal valid VMF with one axis-aligned world solid.
 *
 * @returns VMF text.
 */
function buildSimpleBoxVmf(): string {
  return `
world
{
	"id" "1"
	"classname" "worldspawn"
	"skyname" "sky_day01_01"
	solid
	{
		"id" "10"
		side
		{
			"id" "1"
			"plane" "(-32 -32 32) (-32 32 32) (32 32 32)"
			"material" "DEV/DEV_MEASUREGENERIC01"
			"uaxis" "[1 0 0 0] 0.25"
			"vaxis" "[0 -1 0 0] 0.25"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "2"
			"plane" "(-32 -32 -32) (32 -32 -32) (32 32 -32)"
			"material" "DEV/DEV_MEASUREGENERIC01"
			"uaxis" "[1 0 0 0] 0.25"
			"vaxis" "[0 -1 0 0] 0.25"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "3"
			"plane" "(-32 -32 32) (32 -32 32) (32 -32 -32)"
			"material" "DEV/DEV_MEASUREGENERIC01"
			"uaxis" "[1 0 0 0] 0.25"
			"vaxis" "[0 0 -1 0] 0.25"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "4"
			"plane" "(32 32 -32) (32 -32 -32) (32 -32 32)"
			"material" "DEV/DEV_MEASUREGENERIC01"
			"uaxis" "[0 1 0 0] 0.25"
			"vaxis" "[0 0 -1 0] 0.25"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "5"
			"plane" "(-32 32 -32) (32 32 -32) (32 32 32)"
			"material" "DEV/DEV_MEASUREGENERIC01"
			"uaxis" "[1 0 0 0] 0.25"
			"vaxis" "[0 0 -1 0] 0.25"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}
		side
		{
			"id" "6"
			"plane" "(-32 32 32) (-32 -32 32) (-32 -32 -32)"
			"material" "DEV/DEV_MEASUREGENERIC01"
			"uaxis" "[0 1 0 0] 0.25"
			"vaxis" "[0 0 -1 0] 0.25"
			"rotation" "0"
			"lightmapscale" "16"
			"smoothing_groups" "0"
		}
	}
}
`;
}

/**
 * Creates a test mesh with box geometry.
 *
 * @param name The mesh name.
 * @returns The created mesh.
 */
function createTestMesh(name: string = 'TestMesh'): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}
