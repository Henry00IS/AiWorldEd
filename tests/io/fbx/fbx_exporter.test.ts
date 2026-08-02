import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { buildExportScene } from '@/io/scene/builder_export_scene.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { createDefaultGameProfile } from '@/settings/store/settings_defaults.js';
import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import { axisToVector, buildExportRootTransform, unitsPerMeter } from '@/io/coordinates/coordinate_space_transform.js';
import type { GameProfile } from '@/settings/store/settings_types.js';

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

  it.each([
    ['Blender', 'blender', 'millimeter', 2, 1, 1, 1, 0, 1, 0.1],
    ['Unity', 'unity', 'meter', 1, 1, 2, 1, 0, 1, 100],
    ['Godot', 'godot', 'meter', 1, 1, 2, -1, 0, 1, 100],
    ['Unreal', 'unreal', 'centimeter', 2, 1, 0, 1, 1, 1, 1],
  ] as const)(
    'should write %s profile axes and units to FBX metadata',
    (
      _name,
      presetId,
      metricUnit,
      upAxis,
      upAxisSign,
      frontAxis,
      frontAxisSign,
      coordinateAxis,
      coordinateAxisSign,
      unitScaleFactor,
    ) => {
      worldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      const text = exporter.export(worldGroup, createProfile(presetId, metricUnit));
      expect(text).toMatch(new RegExp(`P: "UpAxis", "int", "Integer", "", ${upAxis}\\b`));
      expect(text).toMatch(new RegExp(`P: "UpAxisSign", "int", "Integer", "", ${upAxisSign}\\b`));
      expect(text).toMatch(new RegExp(`P: "FrontAxis", "int", "Integer", "", ${frontAxis}\\b`));
      expect(text).toMatch(new RegExp(`P: "FrontAxisSign", "int", "Integer", "", ${frontAxisSign}\\b`));
      expect(text).toMatch(new RegExp(`P: "CoordAxis", "int", "Integer", "", ${coordinateAxis}\\b`));
      expect(text).toMatch(new RegExp(`P: "CoordAxisSign", "int", "Integer", "", ${coordinateAxisSign}\\b`));
      expect(text).toMatch(new RegExp(`P: "UnitScaleFactor", "double", "Number", "", ${unitScaleFactor}\\b`));
    },
  );

  it('should keep source transforms unchanged after profile-aware export', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    mesh.position.set(2, 3, 4);
    mesh.rotation.set(0.2, 0.3, 0.4);
    worldGroup.add(mesh);
    worldGroup.updateMatrixWorld(true);
    const originalMatrix = mesh.matrixWorld.clone();
    exporter.export(worldGroup, createProfile('unreal', 'centimeter'));
    expect(mesh.matrixWorld.elements).toEqual(originalMatrix.elements);
  });

  it('should reverse polygon winding for reflective Unreal export', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    worldGroup.add(mesh);

    const text = exporter.export(worldGroup, createProfile('unreal', 'centimeter'));

    expect(text).toMatch(/PolygonVertexIndex: \*3 \{\s*\ta: 0,2,-2/);
  });

  it('should bake Unreal axes and centimeters without a reflected root transform', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setIndex([0, 1, 2]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = 'UnrealTriangle';
    mesh.position.set(1, 2, 3);
    worldGroup.add(mesh);

    const text = exporter.export(worldGroup, createProfile('unreal', 'centimeter'));

    expect(text).toMatch(/Model::UnrealTriangle[\s\S]*Lcl Translation[^\n]*-300\.0,100\.0,200\.0/);
    expect(text).toMatch(/Vertices: \*9 \{\s*\ta: 0,0,0,0,100,0,0,0,100/);
    expect(text).not.toMatch(/Model::ExportRoot[\s\S]*Lcl Scaling[^\n]*-100\.0/);
  });

  it('should map the editor axis marker into Unreal right up and forward axes', () => {
    const profile = createProfile('unreal', 'centimeter');
    const sourcePoints = createAxisMarkerPoints();
    const geometry = createAxisMarkerGeometry(sourcePoints);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = 'UnrealAxisMarker';
    worldGroup.add(mesh);

    const text = exporter.export(worldGroup, profile);
    const exportedPoints = readFbxNumericArray(text, 'Vertices');
    const exportTransform = buildExportRootTransform(profile);
    const expectedPoints = sourcePoints.flatMap((point) => point.clone().applyMatrix4(exportTransform).toArray());
    const exportScale = unitsPerMeter(profile);
    const expectedRight = axisToVector(profile.coordinateSpace.right).multiplyScalar(exportScale).toArray();
    const expectedUp = axisToVector(profile.coordinateSpace.up).multiplyScalar(exportScale).toArray();
    const expectedForward = axisToVector(profile.coordinateSpace.forward).multiplyScalar(exportScale).toArray();

    expectNumericArraysToMatch(exportedPoints, expectedPoints);
    expectNumericArraysToMatch(new THREE.Vector3(1, 0, 0).applyMatrix4(exportTransform).toArray(), expectedRight);
    expectNumericArraysToMatch(new THREE.Vector3(0, 1, 0).applyMatrix4(exportTransform).toArray(), expectedUp);
    expectNumericArraysToMatch(new THREE.Vector3(0, 0, -1).applyMatrix4(exportTransform).toArray(), expectedForward);
    expect(text).toContain('P: "UpAxis", "int", "Integer", "", 2');
    expect(text).toContain('P: "FrontAxis", "int", "Integer", "", 0');
    expect(text).toContain('P: "FrontAxisSign", "int", "Integer", "", 1');
    expect(text).toContain('P: "CoordAxis", "int", "Integer", "", 1');
    expect(text).toContain('P: "CoordAxisSign", "int", "Integer", "", 1');
  });

  it('should keep an asymmetric forward-facing mesh aligned to Unreal +X', () => {
    const profile = createProfile('unreal', 'centimeter');
    const sourcePoints = createAsymmetricForwardMeshPoints();
    const geometry = createAsymmetricForwardMeshGeometry(sourcePoints);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = 'UnrealForwardFacingMesh';
    worldGroup.add(mesh);

    const text = exporter.export(worldGroup, profile);
    const exportedPoints = readFbxNumericArray(text, 'Vertices');
    const exportTransform = buildExportRootTransform(profile);
    const expectedPoints = sourcePoints.flatMap((point) => point.clone().applyMatrix4(exportTransform).toArray());
    const exportedForwardTip = new THREE.Vector3(
      exportedPoints[12] ?? 0,
      exportedPoints[13] ?? 0,
      exportedPoints[14] ?? 0,
    );

    expectNumericArraysToMatch(exportedPoints, expectedPoints);
    expectNumericArraysToMatch(exportedForwardTip.toArray(), expectedPoints.slice(12, 15));
    expect(text).toContain('Model::UnrealForwardFacingMesh');
  });

  it('should canonicalize stale Unreal profile axes for FBX export', () => {
    const profile = createProfile('unreal', 'centimeter');
    profile.coordinateSpace.forward = '-x';
    profile.coordinateSpace.right = '-y';
    const sourcePoints = createAxisMarkerPoints();
    const mesh = new THREE.Mesh(createAxisMarkerGeometry(sourcePoints), new THREE.MeshStandardMaterial());
    worldGroup.add(mesh);

    const text = exporter.export(worldGroup, profile);
    const exportedPoints = readFbxNumericArray(text, 'Vertices');
    const canonicalProfile = createProfile('unreal', 'centimeter');
    const expectedTransform = buildExportRootTransform(canonicalProfile);
    const expectedPoints = sourcePoints.flatMap((point) => point.clone().applyMatrix4(expectedTransform).toArray());

    expectNumericArraysToMatch(exportedPoints, expectedPoints);
    expect(text).toContain('P: "FrontAxis", "int", "Integer", "", 0');
    expect(text).toContain('P: "FrontAxisSign", "int", "Integer", "", 1');
    expect(text).toContain('P: "CoordAxis", "int", "Integer", "", 1');
    expect(text).toContain('P: "CoordAxisSign", "int", "Integer", "", 1');
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
 * Builds a profile using one supplied engine coordinate convention.
 *
 * @param presetId Built-in coordinate space identifier.
 * @param metricUnit Profile metric unit.
 * @returns Profile configured for the selected engine convention.
 */
function createProfile(
  presetId: 'blender' | 'unity' | 'godot' | 'unreal',
  metricUnit: GameProfile['metricUnit'],
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
 * Creates source points for an axis marker whose fourth point is editor
 * forward.
 *
 * @returns Origin, right, up, and forward marker points.
 */
function createAxisMarkerPoints(): THREE.Vector3[] {
  return [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, -1),
  ];
}

/**
 * Creates indexed triangles that retain all axis-marker points in the export.
 *
 * @param points Axis-marker points.
 * @returns Indexed marker geometry.
 */
function createAxisMarkerGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points);
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/**
 * Creates an asymmetric mesh with a distinct forward tip.
 *
 * @returns Base corners and forward tip points.
 */
function createAsymmetricForwardMeshPoints(): THREE.Vector3[] {
  return [
    new THREE.Vector3(-2, 0, 1),
    new THREE.Vector3(2, 0, 1),
    new THREE.Vector3(2, 1, 1),
    new THREE.Vector3(-2, 1, 1),
    new THREE.Vector3(0, 0, -3),
  ];
}

/**
 * Creates triangles for an asymmetric forward-facing mesh.
 *
 * @param points Asymmetric mesh points.
 * @returns Indexed asymmetric mesh geometry.
 */
function createAsymmetricForwardMeshGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints(points);
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 4, 1]);
  return geometry;
}

/**
 * Reads one numeric FBX array property from serialized text.
 *
 * @param text Serialized FBX document.
 * @param propertyName FBX array property name.
 * @returns Parsed numeric values.
 */
function readFbxNumericArray(text: string, propertyName: string): number[] {
  const match = text.match(new RegExp(`${propertyName}: \\*\\d+ \\{\\s*\\ta: ([^\\n]*)`));
  if (!match?.[1]) {
    throw new Error(`Missing FBX array property: ${propertyName}`);
  }
  return match[1].split(',').map((value) => Number(value));
}

/**
 * Compares numeric arrays using a tolerance suitable for serialized transforms.
 *
 * @param actual Actual serialized values.
 * @param expected Expected transformed values.
 */
function expectNumericArraysToMatch(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index] ?? 0, 5);
  });
}
