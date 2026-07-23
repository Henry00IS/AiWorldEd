import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { SceneIOHandler } from '../../src/managers/scene_io_handler.js';
import { SceneSerializer } from '../../src/io/scene_serializer.js';
import { SceneDeserializer } from '../../src/io/scene_deserializer.js';

describe('SceneIOHandler', () => {
  let handler: SceneIOHandler;
  let worldGroup: THREE.Group;

  beforeEach(() => {
    handler = new SceneIOHandler();
    worldGroup = new THREE.Group();
  });

  it('should serialize scene data with real geometry through SceneSerializer', () => {
    const mesh = createTestMesh('SavedCube');
    mesh.position.set(1, 2, 3);
    worldGroup.add(mesh);
    const serializer = new SceneSerializer();
    const sceneData = serializer.serialize(worldGroup);
    expect(sceneData.version).toBe(3);
    expect(sceneData.objects.length).toBe(1);
    expect(sceneData.objects[0].name).toBe('SavedCube');
    expect(sceneData.objects[0].position.x).toBe(1);
    expect(sceneData.objects[0].position.y).toBe(2);
    expect(sceneData.objects[0].position.z).toBe(3);
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
    expect(target.children[0].name).toBe('RestoredMesh');
    expect(target.children[0].position.x).toBeCloseTo(5);
    expect(target.children[0].position.y).toBeCloseTo(10);
    expect(target.children[0].position.z).toBeCloseTo(15);
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
    expect(target.children[0].name).toBe('RoundTrip');
    expect(target.children[0].position.x).toBeCloseTo(3);
  });

  it('should load scene with null status bar without aborting', async () => {
    const mesh = createTestMesh('LoadNoStatus');
    worldGroup.add(mesh);
    const serializer = new SceneSerializer();
    const json = JSON.stringify(serializer.serialize(worldGroup));
    const fileDialog = (handler as unknown as {
      fileDialogManager: { loadJSON: () => Promise<string | null> };
    }).fileDialogManager;
    vi.spyOn(fileDialog, 'loadJSON').mockResolvedValue(json);
    const target = new THREE.Group();
    let loaded = false;
    await handler.loadScene(target, () => {
      loaded = true;
    }, null);
    expect(loaded).toBe(true);
    expect(target.children.length).toBe(1);
    expect(target.children[0].name).toBe('LoadNoStatus');
  });

  it('should export GLB and produce non-empty buffer for real meshes', async () => {
    const mesh = createTestMesh('ExportMe');
    worldGroup.add(mesh);
    const buffer = await (handler as unknown as {
      glbExporter: { export: (group: THREE.Group) => Promise<ArrayBuffer> };
    }).glbExporter.export(worldGroup);
    expect(buffer.byteLength).toBeGreaterThan(0);
    const magic = new DataView(buffer).getUint32(0, true);
    expect(magic).toBe(0x46546c67);
  });

  it('imports a VMF document into a solid model with brushes', () => {
    const vmf = buildSimpleBoxVmf();
    const result = handler.importVmfFromText(vmf, 'room_01.vmf', null);
    expect(result).not.toBeNull();
    expect(result!.model.root.name).toBe('room_01');
    expect(result!.importedBrushCount).toBe(1);
    expect(result!.model.getBrushCount()).toBe(1);
    expect(result!.model.getBrushes()[0].brush.faces.length).toBe(6);
  });

  it('returns null when the VMF has no importable brushes', () => {
    const emptyWorld = `
world
{
	"id" "1"
	"classname" "worldspawn"
}
`;
    const result = handler.importVmfFromText(emptyWorld, 'empty.vmf', null);
    expect(result).toBeNull();
  });

  it('loads a VMF via the file dialog path', async () => {
    const fileDialog = (handler as unknown as {
      fileDialogManager: {
        loadTextFile: () => Promise<{ text: string; filename: string } | null>;
      };
    }).fileDialogManager;
    vi.spyOn(fileDialog, 'loadTextFile').mockResolvedValue({
      text: buildSimpleBoxVmf(),
      filename: 'dialog_map.vmf'
    });
    const result = await handler.importVmf(null);
    expect(result).not.toBeNull();
    expect(result!.model.root.name).toBe('dialog_map');
    expect(result!.importedBrushCount).toBe(1);
  });
});

/**
 * Minimal valid VMF with one axis-aligned world solid.
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
