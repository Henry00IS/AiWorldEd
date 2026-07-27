import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '../../src/io/fbx_exporter.js';
import { buildExportScene } from '../../src/io/export_scene_builder.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../src/solid/model/solid_brush_visual.js';
import { createDefaultGameProfile } from '../../src/settings/settings_defaults.js';
import { getBuiltInCoordinateSpace } from '../../src/settings/coordinate_space_presets.js';
import type { GameProfile } from '../../src/settings/settings_types.js';

describe('FbxExporter', () => {
  let worldGroup: THREE.Group;
  let exporter: FbxExporter;

  beforeEach(() => {
    worldGroup = new THREE.Group();
    exporter = new FbxExporter();
  });

  it('should produce ASCII FBX text for a single mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    mesh.name = 'Cube';
    worldGroup.add(mesh);
    const text = exporter.export(worldGroup);
    expect(text).toContain('; FBX 7.4.0 project file');
    expect(text).toContain('Created by AI World Editor');
    expect(text).toContain('FBXVersion: 7400');
    expect(text).toContain('Objects:');
    expect(text).toContain('Geometry:');
    expect(text).toContain('Vertices:');
    expect(text).toContain('PolygonVertexIndex:');
    expect(text).toContain('Connections:');
    expect(text).toContain('Model::Cube');
  });

  it('should declare meter file units via UnitScaleFactor 100 for Blender/Unity', () => {
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const text = exporter.export(worldGroup);
    expect(text).toMatch(/P: "UnitScaleFactor", "double", "Number", "", 100\b/);
    expect(text).toMatch(/P: "OriginalUnitScaleFactor", "double", "Number", "", 100\b/);
  });

  it('should declare centimeter UnitScaleFactor when profile bakes cm units', () => {
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const text = exporter.export(worldGroup, createCentimeterProfile());
    expect(text).toMatch(/P: "UnitScaleFactor", "double", "Number", "", 1\b/);
  });

  it('should include hierarchy names for groups and meshes', () => {
    const group = new THREE.Group();
    group.name = 'Room';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = 'Wall';
    group.add(mesh);
    worldGroup.add(group);
    const text = exporter.export(worldGroup);
    expect(text).toContain('Model::Room');
    expect(text).toContain('Model::Wall');
    expect(text).toMatch(/C: "OO",\d+,\d+/);
  });

  it('should emit normals and UVs when geometry provides them', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    worldGroup.add(mesh);
    const text = exporter.export(worldGroup);
    expect(text).toContain('LayerElementNormal:');
    expect(text).toContain('LayerElementUV:');
    expect(text).toContain('Normals:');
    expect(text).toContain('UV:');
  });

  it('should write material diffuse color for standard materials', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000, name: 'RedPaint' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    worldGroup.add(mesh);
    const text = exporter.export(worldGroup);
    expect(text).toContain('Material::RedPaint');
    expect(text).toContain('DiffuseColor');
    expect(text).toMatch(/P: "DiffuseColor".*1\.0,0\.0,0\.0/);
  });

  it('should export matte materials that Blender maps to full roughness', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x4488cc, name: 'Wall' });
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const text = exporter.export(worldGroup);
    // Blender: roughness = 1 - sqrt(Shininess)/10; Shininess 0.0 ⇒ roughness 1.
    // SpecularFactor 0.0 ⇒ Principled specular 0. Unity reads the same knobs.
    expect(text).toMatch(/P: "SpecularFactor", "Number", "", "A", 0\.0\b/);
    expect(text).toMatch(/P: "Shininess", "Number", "", "A", 0\.0\b/);
    expect(text).toMatch(/P: "ShininessExponent", "Number", "", "A", 0\.0\b/);
    expect(text).toMatch(/P: "ReflectionFactor", "Number", "", "A", 0\.0\b/);
    expect(text).toMatch(/P: "SpecularColor", "Color", "", "A",0\.0,0\.0,0\.0/);
    expect(text).toContain('3dsMax|Parameters|roughness');
    expect(text).toMatch(/P: "3dsMax\|Parameters\|roughness", "Float", "", "A", 1\.0\b/);
    expect(text).toMatch(/P: "3dsMax\|Parameters\|metalness", "Float", "", "A", 0\.0\b/);
  });

  it('should omit solid brush hull helpers and keep the CSG result', () => {
    const model = new SolidModel('FbxSolid');
    model.addBoxBrush(2, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Subtractive);
    worldGroup.add(model.root);
    const liveBrushCount = model.root.children.filter((child) => SolidBrushVisual.isBrushObject(child)).length;
    expect(liveBrushCount).toBeGreaterThanOrEqual(2);
    const filtered = buildExportScene(worldGroup);
    const exportMeshes: THREE.Mesh[] = [];
    filtered.traverse((obj) => {
      if (obj instanceof THREE.Mesh) exportMeshes.push(obj);
    });
    expect(exportMeshes.length).toBe(1);
    const text = exporter.export(worldGroup);
    expect(text).toContain('Vertices:');
    expect(text).toContain('PolygonVertexIndex:');
  });

  it('should bake profile unit conversion into exported transforms', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    mesh.position.set(1, 0, 0);
    worldGroup.add(mesh);
    const withoutProfile = exporter.export(worldGroup);
    const withProfile = exporter.export(worldGroup, createCentimeterProfile());
    expect(withProfile).not.toBe(withoutProfile);
    expect(withProfile).toContain('ExportRoot');
    expect(withProfile).toContain('Lcl Scaling');
  });

  it('should export a package with texture files when maps are present', async () => {
    const map = createSolidColorTexture(64, 32, 200);
    map.name = 'brick_wall';
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map, name: 'Brick' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    worldGroup.add(mesh);
    const pkg = await exporter.exportPackage(worldGroup, null, 'level');
    expect(pkg.fbxFileName).toBe('level.fbx');
    expect(pkg.fbxText).toContain('Texture::');
    expect(pkg.fbxText).toContain('brick_wall.png');
    expect(pkg.fbxText).toContain('RelativeFilename:');
    expect(pkg.textures.length).toBe(1);
    expect(pkg.textures[0]!.fileName.endsWith('.png')).toBe(true);
    expect(pkg.textures[0]!.blob.size).toBeGreaterThan(0);
  });

  it('should emit multi-material geometry groups', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.clearGroups();
    geometry.addGroup(0, 18, 0);
    geometry.addGroup(18, 18, 1);
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0xff0000, name: 'MatA' }),
      new THREE.MeshStandardMaterial({ color: 0x00ff00, name: 'MatB' }),
    ];
    worldGroup.add(new THREE.Mesh(geometry, materials));
    const text = exporter.export(worldGroup);
    expect(text).toContain('Material::MatA');
    expect(text).toContain('Material::MatB');
    expect(text).toContain('LayerElementMaterial:');
    expect(text).toContain('ByPolygon');
  });

  it('should not mention third-party exporter brands in output', () => {
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const text = exporter.export(worldGroup);
    expect(text.toLowerCase()).not.toContain('needle');
    expect(text.toLowerCase()).not.toContain('comfy');
    expect(text).toContain('AI World Editor');
  });
});

/**
 * Builds a metric centimeter game profile for export scale tests.
 *
 * @returns Game profile using centimeters.
 */
function createCentimeterProfile(): GameProfile {
  const profile = createDefaultGameProfile('centimeter-test', 'Centimeter Test');
  profile.unitSystem = 'metric';
  profile.metricUnit = 'centimeter';
  profile.coordinateSpace = getBuiltInCoordinateSpace('threejs') ?? profile.coordinateSpace;
  return profile;
}

/**
 * Creates a small solid-color data texture for map export tests.
 *
 * @param red Red channel 0–255.
 * @param green Green channel 0–255.
 * @param blue Blue channel 0–255.
 * @returns THREE.DataTexture with a solid color image buffer.
 */
function createSolidColorTexture(red: number, green: number, blue: number): THREE.Texture {
  const width = 8;
  const height = 8;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}
