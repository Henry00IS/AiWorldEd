import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { createDefaultGameProfile } from '@/settings/store/settings_defaults.js';
import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import type { GameProfile } from '@/settings/store/settings_types.js';

describe('ObjExporter', () => {
  let worldGroup: THREE.Group;
  let exporter: ObjExporter;

  beforeEach(() => {
    worldGroup = new THREE.Group();
    exporter = new ObjExporter();
  });

  it('should produce Wavefront OBJ text for a single mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    mesh.name = 'Cube';
    worldGroup.add(mesh);
    const text = exporter.export(worldGroup);
    expect(text).toContain('# Wavefront OBJ exported by AI World Editor');
    expect(text).toContain('mtllib scene.mtl');
    expect(text).toMatch(/^v /m);
    expect(text).toMatch(/^f /m);
    expect(text).toMatch(/^usemtl /m);
  });

  it('should include multiple meshes as separate objects', () => {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    cube.name = 'CubeA';
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshStandardMaterial());
    sphere.name = 'SphereB';
    worldGroup.add(cube);
    worldGroup.add(sphere);
    const text = exporter.export(worldGroup);
    expect(text).toContain('o CubeA');
    expect(text).toContain('o SphereB');
    const vertexCount = (text.match(/^v /gm) || []).length;
    expect(vertexCount).toBeGreaterThan(8);
  });

  it('should omit solid brush hull helpers from export content', () => {
    const model = new SolidModel('ObjSolid');
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
    expect(text).toMatch(/^v /m);
    expect(text).toMatch(/^f /m);
  });

  it('should bake profile unit conversion into exported vertex positions', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    mesh.position.set(1, 0, 0);
    worldGroup.add(mesh);
    const withoutProfile = exporter.export(worldGroup);
    const centimeters = createCentimeterProfile();
    const withProfile = exporter.export(worldGroup, centimeters);
    expect(withProfile).not.toBe(withoutProfile);
    expect(withProfile).toMatch(/^v /m);
  });

  it('should reverse reflected profile winding and transform normals', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    worldGroup.add(mesh);
    const text = exporter.export(worldGroup, createProfile('unity'));
    expect(text).toContain('vn 0 0 -1');
    expect(text).toMatch(/^f 1\/\/1 3\/\/3 2\/\/2$/m);
  });

  it('should keep source transforms unchanged after profile-aware export', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    mesh.position.set(2, 3, 4);
    mesh.rotation.set(0.2, 0.3, 0.4);
    worldGroup.add(mesh);
    worldGroup.updateMatrixWorld(true);
    const originalMatrix = mesh.matrixWorld.clone();
    exporter.export(worldGroup, createProfile('blender'));
    expect(mesh.matrixWorld.elements).toEqual(originalMatrix.elements);
  });

  it('should export a package with companion MTL materials', async () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000, name: 'RedPaint' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = 'PaintedCube';
    worldGroup.add(mesh);
    const pkg = await exporter.exportPackage(worldGroup, null, 'level');
    expect(pkg.objFileName).toBe('level.obj');
    expect(pkg.mtlFileName).toBe('level.mtl');
    expect(pkg.objText).toContain('mtllib level.mtl');
    expect(pkg.objText).toContain('usemtl RedPaint');
    expect(pkg.mtlText).toContain('newmtl RedPaint');
    expect(pkg.mtlText).toMatch(/^Kd /m);
  });

  it('should reference map_Kd and encode texture images when maps are present', async () => {
    const map = createSolidColorTexture(64, 32, 200);
    map.name = 'brick_wall';
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map, name: 'Brick' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    worldGroup.add(mesh);
    const pkg = await exporter.exportPackage(worldGroup, null, 'scene');
    expect(pkg.mtlText).toContain('newmtl Brick');
    expect(pkg.mtlText).toMatch(/map_Kd\s+\S+\.png/);
    expect(pkg.textures.length).toBe(1);
    expect(pkg.textures[0]!.fileName.endsWith('.png')).toBe(true);
    expect(pkg.textures[0]!.blob.size).toBeGreaterThan(0);
  });

  it('should emit usemtl switches for multi-material geometry groups', async () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.clearGroups();
    geometry.addGroup(0, 18, 0);
    geometry.addGroup(18, 18, 1);
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0xff0000, name: 'MatA' }),
      new THREE.MeshStandardMaterial({ color: 0x00ff00, name: 'MatB' }),
    ];
    worldGroup.add(new THREE.Mesh(geometry, materials));
    const pkg = await exporter.exportPackage(worldGroup);
    expect(pkg.objText).toContain('usemtl MatA');
    expect(pkg.objText).toContain('usemtl MatB');
    expect(pkg.mtlText).toContain('newmtl MatA');
    expect(pkg.mtlText).toContain('newmtl MatB');
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
 * Builds a profile using one supplied engine coordinate convention.
 *
 * @param presetId Built-in coordinate space identifier.
 * @param metricUnit Profile metric unit.
 * @returns Profile configured for the selected engine convention.
 */
function createProfile(
  presetId: 'blender' | 'unity' | 'godot' | 'unreal',
  metricUnit: GameProfile['metricUnit'] = 'meter',
): GameProfile {
  const profile = createDefaultGameProfile(`profile-${presetId}`, presetId);
  profile.metricUnit = metricUnit;
  const coordinateSpace = getBuiltInCoordinateSpace(presetId);
  if (!coordinateSpace) {
    throw new Error(`Missing coordinate space preset: ${presetId}`);
  }
  profile.coordinateSpace = coordinateSpace;
  return profile;
}

/**
 * Creates a small solid-color data texture for map export tests. Uses
 * DataTexture (not CanvasTexture) so the shared export scene builder keeps the
 * map the same way library image maps are kept.
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
