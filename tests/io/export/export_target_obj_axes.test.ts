import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { modelExportBuild } from '@/io/export/model_export_build.js';
import { exportTargetFind } from '@/io/export/export_targets.js';
import { axisToVector } from '@/io/coordinates/coordinate_space_transform.js';
import { objMetaRead, objMetaTransform } from '@/io/obj/obj_meta.js';
import { ObjImporter } from '@/io/obj/obj_importer.js';
import { contentMeshImportCreate, contentMeshImportFinalize } from '@/io/geometry/content_mesh_import.js';
import { createMeshDocumentBox } from '@/mesh/primitive/mesh_primitive_box.js';

/**
 * What each program's OBJ importer does to a file position with its default
 * settings. OBJ files name no axes: Godot reads them as they are, Unity mirrors
 * X, and Blender (wm.obj_import, Forward Axis -Z, Up Axis Y) turns file -Z into
 * its +Y and file +Y into its +Z.
 */
const OBJ_IMPORT: Record<string, (file: THREE.Vector3) => THREE.Vector3> = {
  godot: (file) => file.clone(),
  unity: (file) => new THREE.Vector3(-file.x, file.y, file.z),
  blender: (file) => new THREE.Vector3(file.x, -file.z, file.y),
};

/**
 * Builds a tall box with its center 1 m to the model's right (editor -X), 2 m
 * up and 3 m to the front (editor +Z).
 *
 * @returns World group.
 */
function world(): THREE.Group {
  const group = new THREE.Group();
  const mesh = contentMeshImportCreate(createMeshDocumentBox(1, 4, 0.5), 'Tall', 'objAxesTest');
  mesh.position.set(-1, 2, 3);
  group.add(mesh);
  group.updateMatrixWorld(true);
  contentMeshImportFinalize(mesh, false);
  return group;
}

/**
 * Exports the world as an OBJ for a target.
 *
 * @param targetId Export target id.
 * @returns OBJ text.
 */
async function exportObj(targetId: string): Promise<string> {
  const built = await modelExportBuild(world(), {
    format: 'obj',
    target: exportTargetFind(targetId),
    baseFileName: 'level',
    fbxEncoding: 'binary',
    textures: { mode: 'copy', folder: '' },
    objMaterials: false,
  });
  return await built.files[0]!.blob.text();
}

/**
 * Reads the vertex positions of an OBJ file.
 *
 * @param text OBJ text.
 * @returns Positions.
 */
function positions(text: string): THREE.Vector3[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('v '))
    .map((line) => new THREE.Vector3(...line.slice(2).trim().split(/\s+/).map(Number)));
}

describe('OBJ export target axes', () => {
  it.each(['godot', 'unity', 'blender'])(
    "comes in upright, facing front, after %s's default OBJ import",
    async (targetId) => {
      const space = exportTargetFind(targetId).space.coordinateSpace;
      // The box center in the program's own axes: right, up and front.
      const expected = axisToVector(space.right)
        .multiplyScalar(1)
        .add(axisToVector(space.up).multiplyScalar(2))
        .add(axisToVector(space.forward).multiplyScalar(3));
      const box = new THREE.Box3().setFromPoints(positions(await exportObj(targetId)).map(OBJ_IMPORT[targetId]!));
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      expect(center.toArray().map((value) => Math.round(value * 1e6) / 1e6 + 0)).toEqual(expected.toArray());
      expect(size.dot(axisToVector(space.up).multiply(axisToVector(space.up)))).toBeCloseTo(4, 6);
    },
  );

  it.each(['godot', 'unity', 'blender', 'unreal'])(
    'names the axes of its data in the objmeta comment of a %s OBJ',
    async (targetId) => {
      const text = await exportObj(targetId);
      const toEditor = objMetaTransform(objMetaRead(text)!).invert();
      const box = new THREE.Box3().setFromPoints(positions(text).map((point) => point.applyMatrix4(toEditor)));
      const center = box.getCenter(new THREE.Vector3());
      expect(center.toArray().map((value) => Math.round(value * 1e6) / 1e6 + 0)).toEqual([-1, 2, 3]);
    },
  );

  it("reads an OBJ that Blender's exporter wrote with its defaults upright with Source Program Blender", () => {
    // The tall box as Blender writes it (Forward Axis -Z, Up Axis Y), with no objmeta comment.
    const corners = [-1.5, -0.5].flatMap((x) => [0, 4].flatMap((y) => [2.75, 3.25].map((z) => `v ${x} ${y} ${z}`)));
    const text = `o Tall\n${corners.join('\n')}\nf 1 2 4 3\nf 5 7 8 6\n`;
    const result = new ObjImporter().importFromText(text, 'tall.obj', exportTargetFind('blender').objSpace);
    const box = new THREE.Box3();
    result.meshes.forEach((mesh) => box.expandByObject(mesh));
    expect(box.getCenter(new THREE.Vector3()).toArray()).toEqual([-1, 2, 3]);
  });
});
