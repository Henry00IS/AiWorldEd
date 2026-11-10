import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { APPLICATION_VERSION } from '@/application_identity.js';
import { buildModelFileTransform } from '@/io/coordinates/coordinate_space_transform.js';
import { OBJ_META_LINE_LIMIT, objMetaLine, objMetaRead, objMetaTransform } from '@/io/obj/obj_meta.js';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import type { ExportSpace } from '@/io/coordinates/export_space.js';

/**
 * Returns the JSON of an objmeta line.
 *
 * @param line Comment line.
 * @returns Parsed object.
 */
function metaJson(line: string): Record<string, unknown> {
  expect(line.startsWith('# objmeta ')).toBe(true);
  return JSON.parse(line.slice('# objmeta '.length)) as Record<string, unknown>;
}

/**
 * Builds an OBJ file whose header holds one objmeta comment.
 *
 * @param json Text after the keyword.
 * @returns OBJ text.
 */
function objWith(json: string): string {
  return `# Wavefront OBJ\n# objmeta ${json}\nv 0 0 0\n`;
}

/**
 * @returns An export space in centimeters with Z up and +X front, unlike any
 *   preset.
 */
function customCentimeters(): ExportSpace {
  return {
    metricUnit: 'centimeter',
    coordinateSpace: { presetId: 'custom', up: '+z', right: '-y', forward: '+x' },
  };
}

const VALID = '{"v":1,"up":"+y","forward":"-z","right":"+x","unit":1}';

describe('objmeta writer', () => {
  it.each([
    ['godot', { up: '+y', forward: '+z', right: '-x', unit: 1 }],
    // Blender reads OBJ files +Y up (Forward Axis -Z, Up Axis Y), so its files are written that way.
    ['blender', { up: '+y', forward: '+z', right: '-x', unit: 1 }],
    // Left-handed programs mirror their right axis when they read the right-handed file.
    ['unity', { up: '+y', forward: '+z', right: '-x', unit: 1 }],
    ['unreal', { up: '+z', forward: '+x', right: '-y', unit: 0.01 }],
  ])('describes the axes and unit of a %s file', (targetId, expected) => {
    const json = metaJson(objMetaLine(exportTargetFind(targetId).objSpace));
    expect(json).toEqual({ v: 1, ...expected, generator: `AiWorldEd ${APPLICATION_VERSION}` });
  });

  it('writes meters per file unit', () => {
    expect(metaJson(objMetaLine(customCentimeters()))['unit']).toBe(0.01);
  });

  it('puts the same line near the top of the .obj and the .mtl', async () => {
    const world = new THREE.Group();
    world.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ name: 'Paint' })));
    const space = exportTargetFind('unity').space;
    const pkg = await new ObjExporter().exportPackage(world, space, 'level', { mode: 'copy', folder: '' });
    const line = objMetaLine(space);
    expect(pkg.objText.split('\n').slice(0, 4)).toContain(line);
    expect(pkg.mtl!.text.split('\n').slice(0, 4)).toContain(line);
  });
});

describe('objmeta reader', () => {
  it.each(['godot', 'unity', 'blender', 'unreal'])('reads back the file transform of a %s export', (targetId) => {
    const space = exportTargetFind(targetId).space;
    const meta = objMetaRead(`${objMetaLine(space)}\nv 1 2 3\n`);
    expect(meta).not.toBeNull();
    const read = objMetaTransform(meta!).elements;
    buildModelFileTransform(space).elements.forEach((value, index) => expect(read[index]).toBeCloseTo(value, 12));
  });

  it('reads back custom axes and units', () => {
    const space = customCentimeters();
    const read = objMetaTransform(objMetaRead(objMetaLine(space))!).elements;
    buildModelFileTransform(space).elements.forEach((value, index) => expect(read[index]).toBeCloseTo(value, 9));
  });

  it('ignores unknown keys', () => {
    const meta = objMetaRead(
      objWith('{"v":1,"up":"+y","forward":"-z","right":"+x","unit":1,"extra":{"a":[1,2]},"z":null}'),
    );
    expect(meta).toEqual({ up: '+y', forward: '-z', right: '+x', unit: 1 });
  });

  it.each([
    ['broken JSON', '{"v":1,"up":"+y"'],
    ['an array', '[1,2,3]'],
    ['null', 'null'],
    ['another version', VALID.replace('"v":1', '"v":2')],
    ['a version string', VALID.replace('"v":1', '"v":"1"')],
    ['a missing axis', '{"v":1,"up":"+y","forward":"-z","unit":1}'],
    ['an axis without sign', VALID.replace('"+x"', '"x"')],
    ['an upper-case axis', VALID.replace('"+x"', '"+X"')],
    ['an upper-case key', VALID.replace('"up"', '"Up"')],
    ['an axis that is not a string', VALID.replace('"+x"', '{"toString":"+x"}')],
    ['a zero unit', VALID.replace('"unit":1', '"unit":0')],
    ['a negative unit', VALID.replace('"unit":1', '"unit":-1')],
    ['an infinite unit', VALID.replace('"unit":1', '"unit":1e999')],
    ['a unit string', VALID.replace('"unit":1', '"unit":"1"')],
    ['a prototype key', '{"__proto__":{"v":1,"up":"+y","forward":"-z","right":"+x","unit":1}}'],
  ])('ignores %s', (_name, json) => {
    expect(objMetaRead(objWith(json))).toBeNull();
  });

  it('ignores an oversized or deeply nested line without parsing it', () => {
    const padded = VALID.replace('}', `,"pad":"${'x'.repeat(OBJ_META_LINE_LIMIT)}"}`);
    expect(objMetaRead(objWith(padded))).toBeNull();
    expect(objMetaRead(objWith(`${'['.repeat(100000)}${']'.repeat(100000)}`))).toBeNull();
  });

  it.each([
    ['a repeated axis', '{"v":1,"up":"+y","forward":"+y","right":"+x","unit":1}'],
    ['opposite axes', '{"v":1,"up":"+y","forward":"-y","right":"+x","unit":1}'],
  ])('rejects %s', (_name, json) => {
    expect(objMetaRead(objWith(json))).toBeNull();
  });

  it('accepts all 48 combinations of three different axis letters, right- and left-handed', () => {
    const axes = ['+x', '-x', '+y', '-y', '+z', '-z'];
    const combinations = axes.flatMap((up) => axes.flatMap((forward) => axes.map((right) => ({ up, forward, right }))));
    const valid = combinations.filter(({ up, forward, right }) => new Set([up[1], forward[1], right[1]]).size === 3);
    expect(valid).toHaveLength(48);
    for (const axis of valid) {
      expect(objMetaRead(objWith(JSON.stringify({ v: 1, ...axis, unit: 1 })))).toEqual({ ...axis, unit: 1 });
    }
  });

  it('reads a line anywhere in the header, after other comments or blank lines', () => {
    expect(objMetaRead(`# made by hand\n# in meters\n# objmeta ${VALID}\nv 0 0 0\n`)).not.toBeNull();
    expect(objMetaRead(`\n  \n\t\n# objmeta ${VALID}\nv 0 0 0\n`)).not.toBeNull();
    expect(objMetaRead(`\n# comment\n\n# objmeta ${VALID}\nv 0 0 0\n`)).not.toBeNull();
    expect(objMetaRead(`${'# note\n'.repeat(200)}# objmeta ${VALID}\nv 0 0 0\n`)).not.toBeNull();
  });

  it('ignores a line after the first statement', () => {
    expect(objMetaRead(`# comment\nv 0 0 0\n# objmeta ${VALID}\n`)).toBeNull();
    expect(objMetaRead(`mtllib a.mtl\n# objmeta ${VALID}\n`)).toBeNull();
  });

  it('ignores an indented line', () => {
    expect(objMetaRead(`  # objmeta ${VALID}\nv 0 0 0\n`)).toBeNull();
  });

  it('uses the first valid line, skipping invalid ones', () => {
    const second = '{"v":1,"up":"+z","forward":"-y","right":"-x","unit":0.01}';
    expect(objMetaRead(`# objmeta ${VALID.replace('"unit":1', '"unit":-1')}\n# objmeta ${second}\nv 0 0 0\n`)).toEqual({
      up: '+z',
      forward: '-y',
      right: '-x',
      unit: 0.01,
    });
  });

  it('reads lines up to 4096 bytes', () => {
    const line = (length: number, pad = 'x') => {
      const start = `# objmeta ${VALID.slice(0, -1)},"pad":"`;
      const fill = length - new TextEncoder().encode(`${start}"}`).length;
      return `${start}${pad.repeat(fill / new TextEncoder().encode(pad).length)}"}`;
    };
    expect(OBJ_META_LINE_LIMIT).toBe(4096);
    expect(objMetaRead(`${line(4096)}\nv 0 0 0\n`)).not.toBeNull();
    expect(objMetaRead(`${line(4096)}\r\nv 0 0 0\n`)).not.toBeNull();
    expect(objMetaRead(`${line(4097)}\nv 0 0 0\n`)).toBeNull();
    // Counted in bytes, not characters.
    expect(objMetaRead(`${line(4098, 'é')}\nv 0 0 0\n`)).toBeNull();
  });

  it('skips a byte order mark', () => {
    expect(objMetaRead(`\uFEFF# objmeta ${VALID}\nv 0 0 0\n`)).not.toBeNull();
  });

  it('accepts Windows line ends', () => {
    expect(objMetaRead(`# objmeta ${VALID}\r\nv 0 0 0\r\n`)).toEqual({
      up: '+y',
      forward: '-z',
      right: '+x',
      unit: 1,
    });
  });
});
