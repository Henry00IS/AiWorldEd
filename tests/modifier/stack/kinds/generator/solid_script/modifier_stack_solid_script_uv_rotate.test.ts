import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { lockFaceSurfaceForBrushTransform } from '@/texture/lock/solid_brush_texture_lock.js';

const END: SolidScriptLine = { command: 'end' };

/** The lock choices the editor's rotate, move and scale tools use by default. */
const EDITOR_LOCKS = { positionLock: true, stretchLock: false };

/** Henry's cylinder, standing on the origin. */
const CYLINDER: SolidScriptLine = {
  command: 'cylinder',
  values: { h: '1', r1: '1', r2: '1', anchor: 'Center, Bottom, Center', sides: '16' },
};

/**
 * Compiles a SolidScript generator in an empty solid and returns its brushes.
 *
 * @param lines Script lines.
 * @returns Compiled brushes.
 */
function compiled(lines: readonly SolidScriptLine[]): SolidBrushInstance[] {
  const world = new THREE.Group();
  const model = new SolidModel('UV rotate test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  const script = solidScriptDocumentCreate(lines, 'UV');
  ModifierVolume.write(node, {
    ...settings,
    modifiers: [{ ...first, parameters: { ...first.parameters, script } }, ...rest],
  });
  world.updateMatrixWorld(true);
  return modifierStackCompile(model.getBrushes(), model.root).instances;
}

/**
 * The turn the Rotate block builds: around X, then Y, then Z, in degrees.
 *
 * @param x Degrees around X.
 * @param y Degrees around Y.
 * @param z Degrees around Z.
 * @returns Rotation matrix.
 */
function turn(x: number, y: number, z: number): THREE.Matrix4 {
  const r = THREE.MathUtils.degToRad;
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r(x), r(y), r(z), 'ZYX'));
}

/**
 * The face of a brush whose plane has the given normal and holds the point.
 *
 * @param brush Brush.
 * @param normal Wanted normal.
 * @param point Point on the face.
 * @returns Face index, or -1.
 */
function faceAt(brush: SolidBrushInstance, normal: THREE.Vector3, point: THREE.Vector3): number {
  return brush.brush.planes.findIndex(
    (plane) => plane.normal.dot(normal) > 1 - 1e-6 && Math.abs(plane.normal.dot(point) + plane.offset) < 1e-6,
  );
}

/**
 * Largest UV difference at any face corner between a brush built by the script
 * and the plain brush turned by the editor with its texture lock.
 *
 * @param plain Brush built without the turn.
 * @param turned Brush built inside the script's turn.
 * @param matrix The turn as the editor would apply it.
 * @returns Largest difference in texture units.
 */
function editorGap(plain: SolidBrushInstance, turned: SolidBrushInstance, matrix: THREE.Matrix4): number {
  const next = matrix.clone().multiply(plain.getLocalMatrix());
  // The editor's rotate tool keeps the brush's scale exactly; carry the scale
  // the turn decomposes to so rounding is not mistaken for a stretch.
  const [position, quaternion, scale] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
  next.decompose(position, quaternion, scale);
  plain.getLocalMatrix().decompose(position, quaternion, new THREE.Vector3());
  const previous = new THREE.Matrix4().compose(position, quaternion, scale);
  const toPlain = next.clone().invert().multiply(turned.getLocalMatrix());
  const normalToPlain = new THREE.Matrix3().getNormalMatrix(toPlain);
  let gap = 0;
  turned.brush.faces.forEach((face, index) => {
    const plane = turned.brush.planes[index];
    if (!plane) throw new Error('Expected a plane');
    const normal = plane.normal.clone().applyMatrix3(normalToPlain).normalize();
    for (const vertex of turned.brush.getFaceVertexIndices(face)) {
      const point = turned.brush.vertices[vertex];
      if (!point) throw new Error('Expected a vertex');
      const local = point.clone().applyMatrix4(toPlain);
      const source = faceAt(plain, normal, local);
      expect(source).toBeGreaterThanOrEqual(0);
      const locked = lockFaceSurfaceForBrushTransform(
        plain.getFaceSurface(source),
        plain,
        source,
        previous,
        next,
        EDITOR_LOCKS,
      );
      const want = locked.uv.project(local);
      const got = turned.getFaceSurface(index).uv.project(point);
      gap = Math.max(gap, Math.abs(want.u - got.u), Math.abs(want.v - got.v));
    }
  });
  return gap;
}

/**
 * Compares every brush of a script turned by a Rotate block with the plain
 * script's brushes turned by the editor.
 *
 * @param inner Lines inside the turn.
 * @param x Degrees around X.
 * @param y Degrees around Y.
 * @param z Degrees around Z.
 * @returns Largest difference in texture units.
 */
function rotateGap(inner: readonly SolidScriptLine[], x: number, y: number, z: number): number {
  const plain = compiled(inner);
  const turned = compiled([{ command: 'rotate', values: { a: `${x}, ${y}, ${z}` } }, ...inner, END]);
  expect(turned).toHaveLength(plain.length);
  return Math.max(...plain.map((brush, index) => editorGap(brush, turned[index] as SolidBrushInstance, turn(x, y, z))));
}

/**
 * UVs at every corner of every face, keyed by the corner's place in the model
 * and the face's normal, sorted.
 *
 * @param brushes Brushes.
 * @returns One sorted string per corner.
 */
function corners(brushes: readonly SolidBrushInstance[]): string[] {
  const r = (value: number): number => Math.round(value * 1e4) / 1e4 + 0;
  return brushes
    .flatMap((brush) => {
      const pose = brush.getLocalMatrix();
      const normals = new THREE.Matrix3().getNormalMatrix(pose);
      return brush.brush.faces.flatMap((face, index) => {
        const normal = (brush.brush.planes[index]?.normal ?? new THREE.Vector3())
          .clone()
          .applyMatrix3(normals)
          .normalize();
        return brush.brush.getFaceVertexIndices(face).map((vertex) => {
          const point = brush.brush.vertices[vertex] ?? new THREE.Vector3();
          const uv = brush.getFaceSurface(index).uv.project(point);
          const place = point.clone().applyMatrix4(pose);
          return `${r(place.x)},${r(place.y)},${r(place.z)}/${r(normal.x)},${r(normal.y)},${r(normal.z)}:${r(uv.u)},${r(uv.v)}`;
        });
      });
    })
    .sort();
}

/**
 * UVs at every corner of every face in the brushes' own space, sorted.
 *
 * @param brushes Brushes.
 * @returns One sorted string per corner.
 */
function localCorners(brushes: readonly SolidBrushInstance[]): string[] {
  const r = (value: number): number => Math.round(value * 1e4) / 1e4 + 0;
  return brushes
    .flatMap((brush) =>
      brush.brush.faces.flatMap((face, index) =>
        brush.brush.getFaceVertexIndices(face).map((vertex) => {
          const point = brush.brush.vertices[vertex] ?? new THREE.Vector3();
          const uv = brush.getFaceSurface(index).uv.project(point);
          return `${r(uv.u)},${r(uv.v)}`;
        }),
      ),
    )
    .sort();
}

describe('SolidScript Rotate keeps UVs like the editor rotate tool', () => {
  it("matches the editor turning Henry's cylinder 60 degrees", () => {
    expect(rotateGap([CYLINDER], 0, 0, 60)).toBeLessThan(1e-6);
  });

  it('matches the editor for a cube, a sphere and a Hull under a compound turn', () => {
    expect(rotateGap([{ command: 'cube', values: { size: '2, 1, 3' } }], 20, 35, -50)).toBeLessThan(1e-6);
    expect(rotateGap([{ command: 'sphere', values: { r: '1' } }], 45, 0, 30)).toBeLessThan(1e-6);
    const hull: SolidScriptLine[] = [
      { command: 'hull' },
      { command: 'cube', values: { size: '1, 1, 1' } },
      { command: 'translate', values: { v: '2, 0, 0' } },
      CYLINDER,
      END,
      END,
    ];
    expect(rotateGap(hull, 0, 30, 60)).toBeLessThan(1e-6);
  });

  it('matches the editor for a Linear Extrude', () => {
    const extrude: SolidScriptLine[] = [
      { command: 'linear_extrude', values: { height: '1' } },
      { command: 'circle', values: { r: '1', sides: '8' } },
      END,
    ];
    expect(rotateGap(extrude, 10, 0, 60)).toBeLessThan(1e-6);
  });

  it('matches the editor for Project UVs made inside a Texture block', () => {
    const projected: SolidScriptLine[] = [
      { command: 'texture' },
      CYLINDER,
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'project_uvs', values: { mode: 'Box', size: '0.5' } },
      END,
    ];
    expect(rotateGap(projected, 0, 0, 60)).toBeLessThan(1e-6);
  });

  it('matches the editor turning and then moving a brush, for Translate around Rotate', () => {
    const plain = compiled([CYLINDER]);
    const placed = compiled([
      { command: 'translate', values: { v: '3, 1, -2' } },
      { command: 'rotate', values: { a: '30, 0, 60' } },
      CYLINDER,
      END,
      END,
    ]);
    const matrix = new THREE.Matrix4().makeTranslation(3, 1, -2).multiply(turn(30, 0, 60));
    expect(editorGap(plain[0] as SolidBrushInstance, placed[0] as SolidBrushInstance, matrix)).toBeLessThan(1e-6);
  });

  it('matches the editor for Rotate around Translate, which swings the brush around the origin', () => {
    const plain = compiled([CYLINDER]);
    const swung = compiled([
      { command: 'rotate', values: { a: '0, 45, 0' } },
      { command: 'translate', values: { v: '2, 0, 0' } },
      CYLINDER,
      END,
      END,
    ]);
    const matrix = turn(0, 45, 0).multiply(new THREE.Matrix4().makeTranslation(2, 0, 0));
    expect(editorGap(plain[0] as SolidBrushInstance, swung[0] as SolidBrushInstance, matrix)).toBeLessThan(1e-6);
  });

  it('keeps UVs when an even Scale wraps a turn: the texture keeps its size and turns along', () => {
    const turned = compiled([{ command: 'rotate', values: { a: '0, 0, 60' } }, CYLINDER, END]);
    const grown = compiled([
      { command: 'scale', values: { v: '2, 2, 2' } },
      { command: 'rotate', values: { a: '0, 0, 60' } },
      CYLINDER,
      END,
      END,
    ]);
    const size = (brush: SolidBrushInstance | undefined): number[] =>
      (brush?.brush.faces ?? []).map((_, index) => {
        const uv = brush!.getFaceSurface(index).uv;
        const a = uv.project(new THREE.Vector3(0, 0, 0));
        const b = uv.project(new THREE.Vector3(0, 0, 1));
        const c = uv.project(new THREE.Vector3(1, 0, 0));
        return Math.round((Math.hypot(b.u - a.u, b.v - a.v) + Math.hypot(c.u - a.u, c.v - a.v)) * 1e4) / 1e4;
      });
    expect(size(grown[0]).sort()).toEqual(size(turned[0]).sort());
  });

  it('gives nested turns the same UVs as one turn by their sum', () => {
    const once = compiled([{ command: 'rotate', values: { a: '0, 0, 60' } }, CYLINDER, END]);
    const twice = compiled([
      { command: 'rotate', values: { a: '0, 0, 25' } },
      { command: 'rotate', values: { a: '0, 0, 35' } },
      CYLINDER,
      END,
      END,
    ]);
    expect(corners(twice)).toEqual(corners(once));
  });

  it('keeps the UVs of plain moves and stretches as before', () => {
    const plain = compiled([CYLINDER]);
    const moved = compiled([{ command: 'translate', values: { v: '3, 1, -2' } }, CYLINDER, END]);
    expect(localCorners(moved)).toEqual(localCorners(plain));
    const stretched = compiled([{ command: 'scale', values: { v: '2, 1, 1' } }, CYLINDER, END]);
    expect(stretched[0]?.brush.faces.length).toBe(plain[0]?.brush.faces.length);
  });

  it('keeps the texture size when a turned cylinder is stretched unevenly', () => {
    const turned = compiled([{ command: 'rotate', values: { a: '0, 0, 60' } }, CYLINDER, END]);
    const stretched = compiled([
      { command: 'scale', values: { v: '1, 3, 1' } },
      { command: 'rotate', values: { a: '0, 0, 60' } },
      CYLINDER,
      END,
      END,
    ]);
    expect(stretched).toHaveLength(1);
    const brush = stretched[0];
    if (!brush || !turned[0]) throw new Error('Expected a cylinder');
    const ratios = brush.brush.faces.map((_, index) => {
      const uv = brush.getFaceSurface(index).uv;
      const plane = brush.brush.planes[index];
      if (!plane) throw new Error('Expected a plane');
      const across = new THREE.Vector3(0, 0, 1).projectOnPlane(plane.normal);
      if (across.lengthSq() < 1e-6) across.set(1, 0, 0).projectOnPlane(plane.normal);
      across.normalize();
      const a = uv.project(new THREE.Vector3());
      const b = uv.project(across);
      return Math.hypot(b.u - a.u, b.v - a.v);
    });
    for (const ratio of ratios) expect(ratio).toBeLessThanOrEqual(1 + 1e-6);
    expect(Math.max(...ratios)).toBeGreaterThan(0.5);
  });
});
