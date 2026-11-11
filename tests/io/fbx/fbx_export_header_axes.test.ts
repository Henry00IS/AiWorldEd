import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FbxExporter } from '@/io/fbx/fbx_exporter.js';
import { fbxImportDocumentParse } from '@/io/fbx/import/parse/fbx_import_document.js';
import { fbxImportAxisConversion } from '@/io/fbx/import/scene/fbx_import_axis_conversion.js';
import { FbxImportProperties } from '@/io/fbx/import/parse/fbx_import_properties.js';
import { fbxImportObjectName } from '@/io/fbx/import/parse/fbx_import_node.js';
import { getBuiltInCoordinateSpace } from '@/settings/coordinate/coordinate_space_presets.js';
import type { BuiltInCoordinateSpaceId } from '@/settings/coordinate/coordinate_space_types.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';

/**
 * Builds a meter export space for a built-in coordinate space.
 *
 * @param id Preset id.
 * @returns Export space.
 */
function spaceFor(id: BuiltInCoordinateSpaceId): ExportSpace {
  return { coordinateSpace: getBuiltInCoordinateSpace(id)!, metricUnit: 'meter' };
}

/**
 * Exports a crate at (2, 1, -3) and reads the file back.
 *
 * @param space Export space.
 * @returns Header properties and the crate's translation in file axes.
 */
function exportCrate(space: ExportSpace) {
  const world = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshStandardMaterial());
  crate.name = 'Crate';
  crate.position.set(2, 1, -3);
  world.add(crate);
  const document = fbxImportDocumentParse(new FbxExporter().exportBinary(world, space));
  const model = document.objectsOfType('Model').find(({ node }) => fbxImportObjectName(node.properties[1]) === 'Crate');
  const translation = new FbxImportProperties(model!.node).vector3('Lcl Translation', [0, 0, 0]);
  return { settings: document.globalSettings, translation: new THREE.Vector3(...translation) };
}

/**
 * Reads the six axis values of a file header.
 *
 * @param settings Global settings.
 * @returns Up, front and coord axes with their signs.
 */
function headerAxes(settings: FbxImportProperties): number[] {
  return ['UpAxis', 'UpAxisSign', 'FrontAxis', 'FrontAxisSign', 'CoordAxis', 'CoordAxisSign'].map((name) =>
    settings.number(name, Number.NaN),
  );
}

describe('FBX header axes', () => {
  it.each<BuiltInCoordinateSpaceId>(['blender', 'unreal'])(
    'a Z-up target (%s) writes its real axes, so reading the header brings the data back',
    (id) => {
      const { settings, translation } = exportCrate(spaceFor(id));
      expect(settings.number('UpAxis', Number.NaN)).toBe(2);
      const back = translation.applyMatrix4(fbxImportAxisConversion(settings));
      expect(back.toArray().map((value) => Math.round(value * 1e6) / 1e6 + 0)).toEqual([2, 1, -3]);
    },
  );

  it('Z-up, Y-forward data declares Z up, -Y front and X coord', () => {
    expect(headerAxes(exportCrate(spaceFor('blender')).settings)).toEqual([2, 1, 1, -1, 0, 1]);
  });

  it.each<BuiltInCoordinateSpaceId>(['godot', 'unity'])('a Y-up target (%s) keeps the Y-up header', (id) => {
    expect(headerAxes(exportCrate(spaceFor(id)).settings)).toEqual([1, 1, 2, 1, 0, 1]);
  });
});
