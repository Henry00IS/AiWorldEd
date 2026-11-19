import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackVolumeBox } from '@/modifier/stack/evaluate/modifier_stack_frame.js';
import { modifierStackKindFind } from '@/modifier/stack/modifier_stack_catalog.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';
import { SOLID_SCRIPT_COMMANDS_GENERATORS } from '@/solid_script/commands/solid_script_commands_generators.js';

/** A turn of the node that leaves no axis in place. */
const TURN = new THREE.Euler(0.4, 0.9, -0.3);

/** Where a node sits for a comparison. */
type Pose = 'origin' | 'moved' | 'turned';

/**
 * Builds a generator node in a model and returns its brushes.
 *
 * @param kind Generator kind.
 * @param pose Where the node sits: at the origin, moved, or moved and turned.
 * @param script Script lines, for a SolidScript node.
 * @returns Node and its brushes.
 */
function built(kind: string, pose: Pose, script?: readonly SolidScriptLine[]) {
  const world = new THREE.Group();
  const model = new SolidModel('UV port test');
  world.add(model.root);
  const node = modifierGeneratorNodeCreate(kind);
  if (script) {
    const settings = ModifierVolume.read(node);
    const [first, ...rest] = settings.modifiers;
    if (!first) throw new Error('Expected the generator modifier');
    const parameters = { ...first.parameters, script: solidScriptDocumentCreate([...script], 'UV') };
    ModifierVolume.write(node, { ...settings, modifiers: [{ ...first, parameters }, ...rest] });
  }
  model.root.add(node);
  if (pose !== 'origin') node.position.set(0.7, -0.4, 1.1);
  if (pose === 'turned') node.rotation.copy(TURN);
  world.updateMatrixWorld(true);
  const brushes = modifierStackCompile(model.getBrushes(), model.root).instances.filter((brush) =>
    brush.id.startsWith(`${node.uuid}#`),
  );
  return { node, brushes, model };
}

/**
 * UVs at every face corner, keyed by where the corner and face sit in the node:
 * the same rows mean the same texture on the same shape.
 *
 * @param brushes Generated brushes in model space.
 * @param toNode Model-to-node matrix.
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
 * Face UVs of the native generator and of a SolidScript node whose script runs
 * the same generator block in the same box.
 *
 * @param kind Generator kind id, also the block id.
 * @param pose Where both nodes sit.
 * @returns Rows of the generator and of the script.
 */
function compared(kind: string, pose: Pose): { native: string[]; script: string[] } {
  const native = built(kind, pose);
  const box = modifierStackVolumeBox(native.node);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const script = built(MODIFIER_STACK_SOLID_SCRIPT_KIND, pose, [
    { command: 'transform', values: { move: center.toArray().join(', ') } },
    { command: kind, values: { size: size.toArray().join(', ') } },
    { command: 'end' },
  ]);
  // Node frame without its scale: the box sizes the shape, so scale is not part of where it sits.
  const toNode = (node: THREE.Object3D, model: SolidModel): THREE.Matrix4 => {
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    node.matrixWorld.decompose(position, rotation, new THREE.Vector3());
    const frame = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
    return frame.invert().multiply(model.root.matrixWorld);
  };
  return {
    native: nodeUvs(native.brushes, toNode(native.node, native.model)),
    script: nodeUvs(script.brushes, toNode(script.node, script.model)),
  };
}

/** Generator blocks whose textures turn with the node, as on the generator. */
const FOLLOWING = SOLID_SCRIPT_COMMANDS_GENERATORS.map((command) => command.id).filter(
  (id) => modifierStackKindFind(id)?.volumePoseFollow({}) === 'rigid',
);

describe('SolidScript generator blocks map textures like their generators', () => {
  for (const command of SOLID_SCRIPT_COMMANDS_GENERATORS)
    it(`${command.label} with the node at the origin`, () => {
      const { native, script } = compared(command.id, 'origin');
      expect(native.length).toBeGreaterThan(0);
      expect(script).toEqual(native);
    });

  // A generator whose textures stay where they are in the world when it moves,
  // such as Stairs, only matches a script, whose textures move with the node, at the origin.
  for (const id of FOLLOWING)
    for (const pose of ['moved', 'turned'] as const)
      it(`${id} with the node ${pose}`, () => {
        const { native, script } = compared(id, pose);
        expect(script).toEqual(native);
      });

  it('covers Blast Hole and Arch among the generators whose textures turn with the node', () => {
    expect(FOLLOWING).toEqual(expect.arrayContaining(['blastHole', 'arch']));
  });
});
