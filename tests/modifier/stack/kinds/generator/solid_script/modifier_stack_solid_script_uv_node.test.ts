import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackCacheOf } from '@/modifier/stack/evaluate/modifier_stack_cache.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { lockFaceSurfaceForBrushTransform } from '@/texture/lock/solid_brush_texture_lock.js';

const END: SolidScriptLine = { command: 'end' };

/** Henry's repro: a cylinder turned inside the script. */
const HENRY: SolidScriptLine[] = [
  { command: 'transform', values: { rotate: '0, 0, 60' } },
  { command: 'cylinder', values: { h: '1', r1: '1', r2: '1', anchor: 'Center, Bottom, Center', sides: '16' } },
  END,
];

/** The lock choices the editor's rotate, move and scale tools use by default. */
const EDITOR_LOCKS = { positionLock: true, stretchLock: false };

/**
 * A generator node in a moved and turned solid.
 *
 * @param kind Generator kind.
 * @param script Script lines, for a SolidScript node.
 * @returns Node, its brushes, and a fresh build that skips the cache.
 */
function generator(kind: string, script?: readonly SolidScriptLine[]) {
  const world = new THREE.Group();
  const model = new SolidModel('UV node test');
  world.add(model.root);
  model.root.position.set(1, -2, 0.5);
  model.root.rotation.set(0, 0.3, 0);
  const node = modifierGeneratorNodeCreate(kind);
  if (script) {
    const settings = ModifierVolume.read(node);
    const [first, ...rest] = settings.modifiers;
    if (!first) throw new Error('Expected the generator modifier');
    const parameters = { ...first.parameters, script: solidScriptDocumentCreate([...script], 'UV') };
    ModifierVolume.write(node, { ...settings, modifiers: [{ ...first, parameters }, ...rest] });
  }
  model.root.add(node);
  const brushes = (): SolidBrushInstance[] => {
    world.updateMatrixWorld(true);
    return modifierStackCompile(model.getBrushes(), model.root).instances.filter((brush) =>
      brush.id.startsWith(`${node.uuid}#`),
    );
  };
  const fresh = (): SolidBrushInstance[] => {
    modifierStackCacheOf(model.root).clear();
    return brushes();
  };
  const toNode = (): THREE.Matrix4 => {
    world.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    node.matrixWorld.decompose(position, rotation, new THREE.Vector3());
    const frame = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
    return frame.invert().multiply(model.root.matrixWorld);
  };
  return { node, brushes, fresh, toNode };
}

/**
 * UVs at every face corner, keyed by where the corner and face sit relative to
 * the node: the same keys and UVs mean the textures did not move on the shape.
 *
 * @param brushes Generated brushes in model space.
 * @param toNode Model-to-node matrix, without the node's scale.
 * @returns Sorted rows.
 */
function nodeUvs(brushes: readonly SolidBrushInstance[], toNode: THREE.Matrix4): string[] {
  // Rounded to a thousandth, off the sixteenths the default textures often land on.
  const r = (value: number): number => Math.round(value * 1e3 + 1e-4) / 1e3 + 0;
  const normals = new THREE.Matrix3().getNormalMatrix(toNode);
  return brushes
    .flatMap((brush) =>
      brush.brush.faces.flatMap((face, index) => {
        const normal = brush.brush.planes[index]!.normal.clone().applyMatrix3(normals).normalize();
        return brush.brush.getFaceVertexIndices(face).map((vertex) => {
          const point = brush.brush.vertices[vertex]!;
          const at = point.clone().applyMatrix4(toNode);
          const uv = brush.getFaceSurface(index).uv.project(point);
          return `${r(at.x)},${r(at.y)},${r(at.z)}|${r(normal.x)},${r(normal.y)},${r(normal.z)}|${r(uv.u)},${r(uv.v)}`;
        });
      }),
    )
    .sort();
}

/**
 * Largest UV difference between brushes after a node move and the brushes
 * before it carried along by the editor's texture lock.
 *
 * @param before Brushes before, in model space.
 * @param after Brushes after, in model space and the same order.
 * @param delta Model-space move of the node.
 * @returns Largest difference in texture units.
 */
function editorGap(before: readonly SolidBrushInstance[], after: readonly SolidBrushInstance[], delta: THREE.Matrix4) {
  let gap = 0;
  const [position, rotation, scale] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
  delta.decompose(position, rotation, scale);
  // The editor keeps a brush's scale exactly while turning it.
  const previous = new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z);
  before.forEach((brush, at) => {
    const moved = after[at]!;
    brush.brush.faces.forEach((face, index) => {
      const locked = lockFaceSurfaceForBrushTransform(
        brush.getFaceSurface(index),
        brush,
        index,
        previous,
        delta,
        EDITOR_LOCKS,
      );
      for (const vertex of brush.brush.getFaceVertexIndices(face)) {
        const point = brush.brush.vertices[vertex]!;
        const want = locked.uv.project(point);
        const got = moved.getFaceSurface(index).uv.project(point.clone().applyMatrix4(delta));
        gap = Math.max(gap, Math.abs(want.u - got.u), Math.abs(want.v - got.v));
      }
    });
  });
  return gap;
}

/**
 * Model-space matrix that takes the node's old pose to its new one.
 *
 * @param before Model-to-node matrix before.
 * @param after Model-to-node matrix after.
 * @returns Move in model space.
 */
function nodeDelta(before: THREE.Matrix4, after: THREE.Matrix4): THREE.Matrix4 {
  return after.clone().invert().multiply(before);
}

describe('SolidScript generator UVs when the node moves', () => {
  it("keeps Henry's turned cylinder's UVs when the whole node is turned, like the editor turning the brush", () => {
    const fixture = generator(MODIFIER_STACK_SOLID_SCRIPT_KIND, HENRY);
    const before = fixture.fresh();
    const frameBefore = fixture.toNode();
    fixture.node.rotation.set(0.4, -0.7, 1.1);
    const after = fixture.brushes();
    const frameAfter = fixture.toNode();
    expect(after).toHaveLength(before.length);
    expect(nodeUvs(after, frameAfter)).toEqual(nodeUvs(before, frameBefore));
    expect(editorGap(before, after, nodeDelta(frameBefore, frameAfter))).toBeLessThan(1e-6);
    expect(nodeUvs(fixture.fresh(), frameAfter)).toEqual(nodeUvs(after, frameAfter));
  });

  it('keeps the UVs when the node is moved, turned and moved again', () => {
    const fixture = generator(MODIFIER_STACK_SOLID_SCRIPT_KIND, HENRY);
    const before = nodeUvs(fixture.fresh(), fixture.toNode());
    fixture.node.position.set(3, 1, -2);
    expect(nodeUvs(fixture.brushes(), fixture.toNode())).toEqual(before);
    fixture.node.rotation.set(0, Math.PI / 3, 0);
    fixture.node.position.set(-1, 0, 4);
    expect(nodeUvs(fixture.brushes(), fixture.toNode())).toEqual(before);
    expect(nodeUvs(fixture.fresh(), fixture.toNode())).toEqual(before);
  });

  it('keeps the UVs on the shape when the node is scaled, which only resizes the box', () => {
    const fixture = generator(MODIFIER_STACK_SOLID_SCRIPT_KIND, HENRY);
    const before = nodeUvs(fixture.fresh(), fixture.toNode());
    fixture.node.scale.set(2, 0.5, 3);
    fixture.node.rotation.set(0.2, 0, 0.5);
    expect(nodeUvs(fixture.brushes(), fixture.toNode())).toEqual(before);
  });

  it('keeps Project UVs made in the script when the node is turned', () => {
    const fixture = generator(MODIFIER_STACK_SOLID_SCRIPT_KIND, [
      ...HENRY,
      { command: 'select_objects' },
      { command: 'select_faces', values: { which: 'All' } },
      { command: 'project_box_uvs', values: { size: '0.5' } },
    ]);
    const before = fixture.fresh();
    const frameBefore = fixture.toNode();
    fixture.node.rotation.set(0, 0, 0.9);
    const after = fixture.brushes();
    expect(nodeUvs(after, fixture.toNode())).toEqual(nodeUvs(before, frameBefore));
    expect(editorGap(before, after, nodeDelta(frameBefore, fixture.toNode()))).toBeLessThan(1e-6);
  });

  it('behaves like the built-in Cylinder generator, whose textures also turn with its node', () => {
    const fixture = generator('cylinder');
    const before = nodeUvs(fixture.fresh(), fixture.toNode());
    fixture.node.rotation.set(0.4, -0.7, 1.1);
    expect(nodeUvs(fixture.brushes(), fixture.toNode())).toEqual(before);
  });
});
