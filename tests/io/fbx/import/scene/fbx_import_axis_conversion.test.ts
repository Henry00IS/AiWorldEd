import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fbxImportAxisConversion } from '@/io/fbx/import/scene/fbx_import_axis_conversion.js';
import { FbxImportProperties } from '@/io/fbx/import/parse/fbx_import_properties.js';
import { FbxImportNode } from '@/io/fbx/import/parse/fbx_import_node.js';

/**
 * Builds global settings.
 *
 * @param values Property name to value.
 * @returns Properties.
 */
function settings(values: Record<string, number>): FbxImportProperties {
  const records = Object.entries(values).map(
    ([name, value]) => new FbxImportNode('P', [name, 'int', '', '', value], []),
  );
  return new FbxImportProperties(
    new FbxImportNode('GlobalSettings', [], [new FbxImportNode('Properties70', [], records)]),
  );
}

/**
 * Converts a file-space point.
 *
 * @param conversion Conversion matrix.
 * @param point File-space point.
 * @returns Editor-space components, rounded.
 */
function converted(conversion: THREE.Matrix4, point: [number, number, number]): number[] {
  return new THREE.Vector3(...point)
    .applyMatrix4(conversion)
    .toArray()
    .map((value) => Math.round(value * 1e6) / 1e6 + 0);
}

describe('fbxImportAxisConversion', () => {
  it('keeps Y-up meter files unchanged', () => {
    const conversion = fbxImportAxisConversion(settings({ UnitScaleFactor: 100 }));
    expect(converted(conversion, [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('scales centimeter files (and files without settings) to meters', () => {
    expect(converted(fbxImportAxisConversion(settings({ UnitScaleFactor: 1 })), [100, 0, 0])).toEqual([1, 0, 0]);
    expect(converted(fbxImportAxisConversion(settings({})), [0, 250, 0])).toEqual([0, 2.5, 0]);
  });

  it('turns Z-up files (front -Y) upright without mirroring them', () => {
    const conversion = fbxImportAxisConversion(
      settings({
        UpAxis: 2,
        UpAxisSign: 1,
        FrontAxis: 1,
        FrontAxisSign: -1,
        CoordAxis: 0,
        CoordAxisSign: 1,
        UnitScaleFactor: 100,
      }),
    );
    expect(converted(conversion, [0, 0, 1])).toEqual([0, 1, 0]);
    expect(converted(conversion, [0, -1, 0])).toEqual([0, 0, 1]);
    expect(conversion.determinant()).toBeGreaterThan(0);
  });

  it('reports left-handed axis systems as a mirroring conversion', () => {
    const conversion = fbxImportAxisConversion(settings({ CoordAxisSign: -1, UnitScaleFactor: 100 }));
    expect(converted(conversion, [-1, 0, 0])).toEqual([1, 0, 0]);
    expect(conversion.determinant()).toBeLessThan(0);
  });
});
