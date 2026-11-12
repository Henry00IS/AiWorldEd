import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { TextureMapCache } from '@/texture/library/texture_map_cache.js';

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
    const text = exporter.exportAscii(worldGroup);
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

  it('should declare meter file units via UnitScaleFactor 100', () => {
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const text = exporter.exportAscii(worldGroup);
    expect(text).toMatch(/P: "UnitScaleFactor", "double", "Number", "",100\b/);
    expect(text).toMatch(/P: "OriginalUnitScaleFactor", "double", "Number", "",100\b/);
  });

  it('should declare centimeter UnitScaleFactor when the export space bakes cm units', () => {
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const text = exporter.exportAscii(worldGroup, createCentimeterSpace());
    expect(text).toMatch(/P: "UnitScaleFactor", "double", "Number", "",1\b/);
  });

  it('should include hierarchy names for groups and meshes', () => {
    const group = new THREE.Group();
    group.name = 'Room';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = 'Wall';
    group.add(mesh);
    worldGroup.add(group);
    const text = exporter.exportAscii(worldGroup);
    expect(text).toContain('Model::Room');
    expect(text).toContain('Model::Wall');
    expect(text).toMatch(/C: "OO",\d+,\d+/);
  });

  it('should emit normals and UVs when geometry provides them', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    worldGroup.add(mesh);
    const text = exporter.exportAscii(worldGroup);
    expect(text).toContain('LayerElementNormal:');
    expect(text).toContain('LayerElementUV:');
    expect(text).toContain('Normals:');
    expect(text).toContain('UV:');
  });

  it('should write material diffuse color for standard materials', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000, name: 'RedPaint' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    worldGroup.add(mesh);
    const text = exporter.exportAscii(worldGroup);
    expect(text).toContain('Material::RedPaint');
    expect(text).toContain('DiffuseColor');
    expect(text).toMatch(/P: "DiffuseColor".*1\.0,0\.0,0\.0/);
  });

  it('should export fully rough matte materials', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0x4488cc, name: 'Wall' });
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const text = exporter.exportAscii(worldGroup);
    // Zero shininess so readers treat the surface as fully rough.
    // SpecularFactor 0.0 ⇒ Principled specular 0. Unity reads the same knobs.
    expect(text).toMatch(/P: "SpecularFactor", "Number", "", "A",0\.0\b/);
    expect(text).toMatch(/P: "Shininess", "Number", "", "A",0\.0\b/);
    expect(text).toMatch(/P: "ShininessExponent", "Number", "", "A",0\.0\b/);
    expect(text).toMatch(/P: "ReflectionFactor", "Number", "", "A",0\.0\b/);
    expect(text).toMatch(/P: "SpecularColor", "Color", "", "A",0\.0,0\.0,0\.0/);
    expect(text).toContain('3dsMax|Parameters|roughness');
    expect(text).toMatch(/P: "3dsMax\|Parameters\|roughness", "Float", "", "A",1\.0\b/);
    expect(text).toMatch(/P: "3dsMax\|Parameters\|metalness", "Float", "", "A",0\.0\b/);
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
    const text = exporter.exportAscii(worldGroup);
    expect(text).toContain('Vertices:');
    expect(text).toContain('PolygonVertexIndex:');
  });

  it('should bake the export space unit conversion into exported transforms', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    mesh.position.set(1, 0, 0);
    worldGroup.add(mesh);
    const withoutSpace = exporter.exportAscii(worldGroup);
    const withSpace = exporter.exportAscii(worldGroup, createCentimeterSpace());
    expect(withSpace).not.toBe(withoutSpace);
    expect(withSpace).not.toContain('ExportRoot');
    expect(withSpace).toContain('Lcl Scaling');
  });

  it('should export a package with texture files when maps are present', async () => {
    const map = createSolidColorTexture(64, 32, 200);
    map.name = 'brick_wall';
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map, name: 'Brick' });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    worldGroup.add(mesh);
    const pkg = await exporter.exportPackage(worldGroup, null, 'level', 'ascii', { mode: 'copy', folder: '' });
    const text = new TextDecoder().decode(pkg.fbxBytes);
    expect([pkg.fbxFileName, pkg.encoding]).toEqual(['level.fbx', 'ascii']);
    expect(text).toContain('Texture::');
    expect(text).toContain('brick_wall.png');
    expect(text).toContain('RelativeFilename:');
    expect(pkg.textures.length).toBe(1);
    expect(pkg.textures[0]!.fileName.endsWith('.png')).toBe(true);
    expect(pkg.textures[0]!.blob.size).toBeGreaterThan(0);
  });

  it('should write a material shared by several meshes once, under its own name', () => {
    const red = new THREE.MeshStandardMaterial({ color: 0xff0000, name: 'RedMat' });
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red));
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red));
    const text = exporter.exportAscii(worldGroup);
    expect(text.match(/Material: \d+, "Material::RedMat/g)).toHaveLength(1);
    expect(text).not.toContain('RedMat_2');
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
    const text = exporter.exportAscii(worldGroup);
    expect(text).toContain('Material::MatA');
    expect(text).toContain('Material::MatB');
    expect(text).toContain('LayerElementMaterial:');
    expect(text).toContain('ByPolygon');
  });

  it.each(['binary', 'ascii'] as const)(
    'should place rotated meshes and their UVs where three.js FBXLoader expects them (%s)',
    (encoding) => {
      const room = new THREE.Group();
      room.position.set(2, 0, -3);
      room.rotation.set(0.3, 0.5, 0.7);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshStandardMaterial());
      mesh.position.set(1, 1, 1);
      mesh.rotation.set(-0.4, 0.2, 1.1);
      room.add(mesh);
      worldGroup.add(room);
      const bytes =
        encoding === 'binary'
          ? exporter.exportBinary(worldGroup)
          : new TextEncoder().encode(exporter.exportAscii(worldGroup));
      const loaded = new FBXLoader().parse(bytes.buffer, '');
      expect(worldCornersWithUvs(loaded)).toEqual(worldCornersWithUvs(worldGroup));
    },
  );

  it('should name map files after the editor texture they come from', () => {
    const map = new TextureMapCache().resolve('textures/walls/arrow.png');
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map })));
    const text = exporter.exportAscii(worldGroup);
    expect(text).toContain('RelativeFilename: "arrow.png"');
    expect(text).toContain('"Texture::arrow"');
  });

  it('should escape quotes in names the way FBX readers expect', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = 'Door "A"';
    worldGroup.add(mesh);
    expect(exporter.exportAscii(worldGroup)).toContain('"Model::Door &quot;A&quot;", "Mesh"');
  });

  it('should not mention third-party exporter brands in output', () => {
    worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    const text = exporter.exportAscii(worldGroup);
    expect(text.toLowerCase()).not.toContain('needle');
    expect(text.toLowerCase()).not.toContain('comfy');
    expect(text).toContain('AI World Editor');
  });
});

/**
 * Builds a centimeter export space with the editor's axes for export scale
 * tests.
 *
 * @returns Export space using centimeters.
 */
function createCentimeterSpace(): ExportSpace {
  return { coordinateSpace: getBuiltInCoordinateSpace('godot')!, metricUnit: 'centimeter' };
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

/**
 * Lists the distinct world-space corners of every mesh with their UVs.
 *
 * @param root Root.
 * @returns Sorted rounded "x y z u v" entries.
 */
function worldCornersWithUvs(root: THREE.Object3D): string[] {
  root.updateMatrixWorld(true);
  const corners = new Set<string>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute('position');
    const uv = object.geometry.getAttribute('uv');
    for (let index = 0; index < position.count; index++) {
      const world = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      const values = [...world.toArray(), uv.getX(index), uv.getY(index)];
      corners.add(values.map((value) => (Math.round(value * 1e4) / 1e4 + 0).toFixed(4)).join(' '));
    }
  });
  return [...corners].sort();
}
