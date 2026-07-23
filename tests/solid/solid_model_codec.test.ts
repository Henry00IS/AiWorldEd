import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidModelCodec } from '../../src/solid/io/solid_model_codec.js';
import { SceneSerializer } from '../../src/io/scene_serializer.js';
import { SceneDeserializer } from '../../src/io/scene_deserializer.js';
import { ApplyFaceTextureCommand } from '../../src/commands/apply_face_texture_command.js';
import { getFaceTextureMaps } from '../../src/texture/face_texture_storage.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { countTriangles } from '../../src/texture/planar_uv_projector.js';

/**
 * Unit tests for solid model persistence with hierarchical brushes.
 */
describe('SolidModelCodec', () => {
  it('round-trips brushes through encode/decode', () => {
    const model = new SolidModel('CodecSolid');
    const first = model.addBoxBrush(2, SolidOperation.Additive);
    first.position.set(0.5, 0, 0);
    first.pushTransformToMesh();
    const second = model.addBoxBrush(1, SolidOperation.Subtractive);
    second.position.set(0, 0.25, 0);
    second.pushTransformToMesh();
    model.rebuild(true);
    const encoded = SolidModelCodec.encode(model);
    expect(encoded.brushes.length).toBe(2);
    const restored = SolidModelCodec.decode(encoded, 'Restored');
    expect(restored.getBrushCount()).toBe(2);
    expect(restored.findBrush(first.id)?.operation).toBe(SolidOperation.Additive);
    expect(restored.findBrush(second.id)?.operation).toBe(SolidOperation.Subtractive);
    expect(restored.findBrush(first.id)?.mesh?.parent).toBe(restored.root);
    const position = restored.getResultMesh().geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
  });

  it('survives scene serialize and deserialize as a group root', () => {
    const world = new THREE.Group();
    const model = new SolidModel('SceneSolid');
    model.addBoxBrush(2, SolidOperation.Additive);
    const cutter = model.addBoxBrush(1, SolidOperation.Subtractive);
    cutter.position.set(0.5, 0, 0);
    cutter.pushTransformToMesh();
    model.rebuild(true);
    model.root.position.set(1, 2, 3);
    world.add(model.root);
    const json = new SceneSerializer().serialize(world);
    const entry = json.objects.find((object) => object.name === 'SceneSolid');
    expect(entry?.type).toBe('group');
    expect(entry?.solidModel).toBeDefined();
    expect(entry?.solidModel?.brushes.length).toBe(2);
    expect(json.objects.filter((object) => object.parentId === entry?.uuid).length).toBe(0);
    const loadedWorld = new THREE.Group();
    new SceneDeserializer().deserialize(json, loadedWorld);
    const loaded = loadedWorld.children.find(
      (child) => child.name === 'SceneSolid'
    );
    expect(loaded).toBeInstanceOf(THREE.Group);
    expect(SolidModel.isSolidModelObject(loaded as THREE.Object3D)).toBe(true);
    const restoredModel = SolidModel.fromObject(loaded as THREE.Object3D);
    expect(restoredModel?.getBrushCount()).toBe(2);
    expect(restoredModel?.getBrushes().every((brush) => brush.mesh)).toBe(true);
    expect(loaded?.position.x).toBeCloseTo(1, 5);
    expect(loaded?.position.y).toBeCloseTo(2, 5);
    expect(loaded?.position.z).toBeCloseTo(3, 5);
  });

  it('round-trips UV editor scale/offset through encode and decode', () => {
    const model = new SolidModel('UvCodec');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const result = model.getResultMesh();
    const triangleCount = countTriangles(result.geometry);
    const indices: number[] = [];
    for (let index = 0; index < triangleCount; index++) indices.push(index);
    const mapping = createDefaultFaceTextureMapping('folder/uv_wall.png');
    mapping.scaleU = 2.5;
    mapping.scaleV = 0.5;
    mapping.offsetU = 0.25;
    mapping.offsetV = -0.1;
    mapping.rotationDeg = 45;
    mapping.align = 'wall';
    const command = new ApplyFaceTextureCommand(
      [{ mesh: result, triangleIndices: indices, previousMapping: null }],
      mapping
    );
    command.execute();
    expect(brush.getSurfaceMapping(0).scaleU).toBeCloseTo(2.5);
    const encoded = SolidModelCodec.encode(model);
    const stored = encoded.brushes[0];
    expect(stored.defaultMapping || stored.faceMappings).toBeTruthy();
    const restored = SolidModelCodec.decode(encoded, 'UvRestored');
    const restoredMaps = getFaceTextureMaps(restored.getResultMesh());
    expect(restoredMaps.length).toBeGreaterThan(0);
    const sample = restoredMaps[0].mapping;
    expect(sample.textureId).toBe('folder/uv_wall.png');
    expect(sample.scaleU).toBeCloseTo(2.5);
    expect(sample.scaleV).toBeCloseTo(0.5);
    expect(sample.offsetU).toBeCloseTo(0.25);
    expect(sample.offsetV).toBeCloseTo(-0.1);
    expect(sample.rotationDeg).toBeCloseTo(45);
    expect(sample.align).toBe('wall');
  });

  it('preserves per-face UV params across scene save and load', () => {
    const world = new THREE.Group();
    const model = new SolidModel('SceneUvSolid');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const result = model.getResultMesh();
    const mapsBefore = getFaceTextureMaps(result);
    expect(mapsBefore.length).toBeGreaterThan(0);
    const firstRegion = mapsBefore[0];
    const mapping = createDefaultFaceTextureMapping('folder/face_uv.png');
    mapping.scaleU = 3;
    mapping.offsetU = 0.5;
    mapping.align = 'floor';
    new ApplyFaceTextureCommand(
      [
        {
          mesh: result,
          triangleIndices: firstRegion.triangleIndices.slice(),
          previousMapping: null
        }
      ],
      mapping
    ).execute();
    world.add(model.root);
    const json = new SceneSerializer().serialize(world);
    const entry = json.objects.find((object) => object.name === 'SceneUvSolid');
    expect(entry?.solidModel?.brushes[0]).toBeDefined();
    const loadedWorld = new THREE.Group();
    new SceneDeserializer().deserialize(json, loadedWorld);
    const loadedRoot = loadedWorld.children.find(
      (child) => child.name === 'SceneUvSolid'
    );
    const restoredModel = SolidModel.fromObject(loadedRoot as THREE.Object3D);
    expect(restoredModel).toBeTruthy();
    const restoredMaps = getFaceTextureMaps(restoredModel!.getResultMesh());
    const matching = restoredMaps.find(
      (entryMap) => entryMap.mapping.textureId === 'folder/face_uv.png'
    );
    expect(matching).toBeDefined();
    expect(matching!.mapping.scaleU).toBeCloseTo(3);
    expect(matching!.mapping.offsetU).toBeCloseTo(0.5);
    expect(matching!.mapping.align).toBe('floor');
  });
});
