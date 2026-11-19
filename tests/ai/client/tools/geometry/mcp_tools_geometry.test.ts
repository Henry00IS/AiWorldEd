import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { listSolidModels } from '@/ai/client/editor_api_lookup.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { editorApiFixtureCreate } from '../../helpers_editor_api.js';

/** A wall with a doorway, as command lines. */
const ROOM = [
  { command: 'part', values: { name: 'wall' } },
  { command: 'cube', values: { size: '4, 0.2, 3' } },
  { command: 'end' },
  { command: 'part', values: { name: 'doorway' } },
  { command: 'translate', values: { v: '0, 0, -0.45' } },
  { command: 'cube', values: { size: '1, 0.4, 2.1' } },
  { command: 'end' },
  { command: 'end' },
  { command: 'difference' },
  { command: 'use_part', values: { name: 'wall' } },
  { command: 'use_part', values: { name: 'doorway' } },
  { command: 'end' },
];

describe('geometry tools', () => {
  it('builds a solid script into a new model with a carved group as one undo step', () => {
    const { api, world, stack } = editorApiFixtureCreate();
    const result = api.invokeTool('geometry_script_build', { lines: ROOM, name: 'Room' });
    expect(result.ok, result.message).toBe(true);
    const [model] = listSolidModels(world);
    expect(model?.root.name).toBe('Room');
    expect(model?.getBrushes().map((brush) => [brush.name.split('.')[0], brush.operation])).toEqual([
      ['wall', 0],
      ['doorway', 1],
    ]);
    stack.undo();
    expect(listSolidModels(world)).toHaveLength(0);
    stack.redo();
    expect(listSolidModels(world)[0]?.getBrushes()).toHaveLength(2);
  });

  it('carves into an existing model with a subtractive top-level operation', () => {
    const { api, world } = editorApiFixtureCreate();
    const created = api.invokeTool('solid_model_create', {});
    const modelId = (created.data as { modelId: string }).modelId;
    const result = api.invokeTool('geometry_script_build', {
      lines: [{ command: 'cube', values: { size: '0.5, 0.5, 0.5' } }],
      modelId,
      operation: 'subtractive',
      name: 'Hole',
    });
    expect(result.ok, result.message).toBe(true);
    const brushes = listSolidModels(world)[0]?.getBrushes() ?? [];
    expect(brushes.at(-1)?.operation).toBe(1);
    expect(brushes.at(-1)?.name).toMatch(/^Hole cube\./);
  });

  it('previews without changing the scene and reports line errors', () => {
    const { api, world } = editorApiFixtureCreate();
    const preview = api.invokeTool('geometry_script_preview', { lines: ROOM });
    expect(preview.ok).toBe(true);
    expect(JSON.stringify(preview.data)).toContain('"group":"difference"');
    expect(listSolidModels(world)).toHaveLength(0);
    const failed = api.invokeTool('geometry_script_build', {
      lines: [{ command: 'cube' }, { command: 'sphere', values: { r: '[size]' } }],
    });
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/^Script: line 2: Radius: there is no variable \[size\]/);
    expect(api.invokeTool('geometry_script_build', { source: 'cube(1);' }).ok).toBe(false);
  });

  it('builds script meshes as regular mesh objects, previews them and undoes them with the brushes', () => {
    const { api, world, stack } = editorApiFixtureCreate();
    const lines = [
      { command: 'mesh_brushes' },
      { command: 'cube', values: { size: '2, 2, 2', anchor: 'Center, Center, Center' } },
      { command: 'end' },
      { command: 'cube', values: { anchor: 'Center, Center, Center' } },
    ];
    const preview = api.invokeTool('geometry_script_preview', { lines });
    expect(preview.message).toBe('Would create 1 brush(es) and 1 mesh(es)');
    expect(preview.data).toMatchObject({ meshes: [{ mesh: 'Mesh From Brushes', vertices: 8, faces: 6 }] });
    const built = api.invokeTool('geometry_script_build', { lines, position: { x: 0, y: 0, z: 5 } });
    expect(built.ok, built.message).toBe(true);
    const meshId = (built.data as { meshes: { meshId: string }[] }).meshes[0]?.meshId;
    const mesh = world.getObjectByProperty('uuid', meshId);
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const positions =
      readPersistentMeshDocument(mesh as THREE.Mesh)
        ?.getTopology()
        .getPositions() ?? [];
    world.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (let index = 0; index < positions.length; index += 3)
      box.expandByPoint(new THREE.Vector3().fromArray(positions, index).applyMatrix4(mesh!.matrixWorld));
    expect(box.getCenter(new THREE.Vector3()).toArray()).toEqual([0, 0, 5]);
    expect(listSolidModels(world)[0]?.getBrushes()).toHaveLength(1);
    stack.undo();
    expect(world.getObjectByProperty('uuid', meshId)).toBeUndefined();
    expect(listSolidModels(world)).toHaveLength(0);
  });

  it('builds a script of meshes only, without a solid model', () => {
    const { api, world } = editorApiFixtureCreate();
    const built = api.invokeTool('geometry_script_build', {
      lines: [
        { command: 'mesh' },
        { command: 'vertex', values: { position: '0, 0, 0' } },
        { command: 'vertex', values: { position: '1, 0, 0' } },
        { command: 'vertex', values: { position: '0, 1, 0' } },
        { command: 'face', values: { corners: '0, 1, 2' } },
        { command: 'end' },
      ],
    });
    expect(built.ok, built.message).toBe(true);
    expect(built.message).toBe('Built 0 brush(es) and 1 mesh(es)');
    expect(listSolidModels(world)).toHaveLength(0);
  });
});
