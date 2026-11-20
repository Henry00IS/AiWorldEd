import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EditSession } from '@/edit/session/edit_session.js';
import { buildEditSessionDomain } from '@/edit/session/edit_session_domain.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierGeneratorNodeCreate } from '@/modifier/stack/modifier_generator_node.js';
import { modifierStackCompile } from '@/modifier/stack/evaluate/modifier_stack_compile.js';
import { modifierStackMeshesShown } from '@/modifier/stack/meshes/modifier_stack_meshes.js';
import { solidScriptDocumentCreate, type SolidScriptLine } from '@/solid_script/document/solid_script_document.js';
import { MODIFIER_STACK_SOLID_SCRIPT_KIND } from '@/modifier/stack/kinds/generator/solid_script/modifier_stack_solid_script_keys.js';

/**
 * Edit Mode (Tab) refuses what a modifier stack builds, a generated brush and a
 * generated mesh alike, while authored brushes and meshes still open.
 */

const END: SolidScriptLine = { command: 'end' };

/**
 * Builds a solid with one authored box brush and a SolidScript generator node
 * that outputs one brush and one mesh, then compiles it.
 *
 * @returns The authored brush mesh, the generated brush mesh and the generated
 *   mesh.
 */
function generatedFixture(): { authored: THREE.Mesh; generatedBrush: THREE.Mesh; generatedMesh: THREE.Mesh } {
  const world = new THREE.Group();
  const model = new SolidModel('Tab test');
  world.add(model.root);
  const authored = model.addBoxBrush(1, SolidOperation.Additive).mesh;
  const node = modifierGeneratorNodeCreate(MODIFIER_STACK_SOLID_SCRIPT_KIND);
  model.root.add(node);
  node.position.set(6, 0, 0);
  generatedScriptSet(node, [{ command: 'mesh_brushes' }, { command: 'cube' }, END, { command: 'cube' }]);
  world.updateMatrixWorld(true);
  const compiled = modifierStackCompile(model.getBrushes(), model.root);
  const generatedBrush = compiled.instances.find((brush) => brush.id.startsWith(`${node.uuid}#`))?.mesh;
  const generatedMesh = modifierStackMeshesShown(node)[0];
  if (!authored || !generatedBrush || !generatedMesh) throw new Error('Expected every fixture object');
  return { authored, generatedBrush, generatedMesh };
}

/**
 * Writes a script into a generator node's first modifier.
 *
 * @param node Generator node.
 * @param lines Script lines.
 */
function generatedScriptSet(node: THREE.Object3D, lines: SolidScriptLine[]): void {
  const settings = ModifierVolume.read(node);
  const [first, ...rest] = settings.modifiers;
  if (!first) throw new Error('Expected the generator modifier');
  const parameters = { ...first.parameters, script: solidScriptDocumentCreate(lines, 'Tab') };
  ModifierVolume.write(node, { ...settings, modifiers: [{ ...first, parameters }, ...rest] });
}

/**
 * Whether Edit Mode opens for a selection, the way Tab tries it.
 *
 * @param selection Selected objects.
 * @returns True when the session opened.
 */
function tabOpens(selection: THREE.Object3D[]): boolean {
  const session = new EditSession();
  const opened = session.enter(selection);
  session.exit();
  return opened;
}

describe('Edit Mode refuses modifier stack output', () => {
  it('does not open for a generated brush', () => {
    const { generatedBrush } = generatedFixture();
    expect(tabOpens([generatedBrush])).toBe(false);
  });

  it('does not open for a mesh a SolidScript generator shows', () => {
    const { generatedMesh } = generatedFixture();
    expect(generatedMesh.userData['meshDocument']).toBeTruthy();
    expect(tabOpens([generatedMesh])).toBe(false);
  });

  it('still opens for an authored brush and an ordinary mesh', () => {
    const { authored } = generatedFixture();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    expect(tabOpens([authored])).toBe(true);
    expect(tabOpens([mesh])).toBe(true);
    mesh.geometry.dispose();
  });

  it('opens only the authored objects of a mixed selection', () => {
    const { authored, generatedBrush, generatedMesh } = generatedFixture();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const domain = buildEditSessionDomain([generatedBrush, generatedMesh, authored, mesh]);
    expect(domain.map((target) => target.kind).sort()).toEqual(['brush', 'content_mesh']);
    expect(domain.some((target) => target.kind === 'content_mesh' && target.mesh === mesh)).toBe(true);
    mesh.geometry.dispose();
  });
});
