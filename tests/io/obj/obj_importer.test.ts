import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ObjExporter } from '@/io/obj/obj_exporter.js';
import { buildObjImportGroupBaseName, ObjImporter } from '@/io/obj/obj_importer.js';
import { ObjParser } from '@/io/obj/obj_parser.js';
import { DECORATIVE_EDGE_USERDATA_KEY } from '@/utils/mesh_edge_sync.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { CommandObjectGroup } from '@/outliner/commands/command_object_group.js';
import { CommandStack } from '@/commands/command_stack.js';

describe('ObjParser', () => {
  it('parses positions, texcoords, named objects, and polygon faces', () => {
    const source = `
# comment
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
o Quad
usemtl Paint
f 1/1 2/2 3/3 4/4
`;
    const parsed = new ObjParser().parse(source);
    expect(parsed.positions).toHaveLength(4);
    expect(parsed.texCoords).toHaveLength(4);
    expect(parsed.objects).toHaveLength(1);
    expect(parsed.objects[0]!.name).toBe('Quad');
    expect(parsed.objects[0]!.faces).toHaveLength(1);
    expect(parsed.objects[0]!.faces[0]!.corners).toHaveLength(4);
    expect(parsed.objects[0]!.faces[0]!.materialName).toBe('Paint');
  });

  it('resolves relative negative indices', () => {
    const source = `
v 0 0 0
v 1 0 0
v 0 1 0
f -3 -2 -1
`;
    const parsed = new ObjParser().parse(source);
    expect(parsed.objects[0]!.faces[0]!.corners.map((corner) => corner.positionIndex)).toEqual([0, 1, 2]);
  });
});

describe('ObjImporter', () => {
  beforeEach(() => {
    hierarchyNameAllocator.reset();
  });

  it('builds a content mesh with decorative edges through the mesh pipeline', () => {
    const source = `
v 0 0 0
v 1 0 0
v 0 1 0
o Triangle
f 1 2 3
`;
    const result = new ObjImporter().importFromText(source);
    expect(result.importedObjectCount).toBe(1);
    expect(result.importedFaceCount).toBe(1);
    expect(result.meshes).toHaveLength(1);
    const mesh = result.meshes[0]!;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThanOrEqual(3);
    expect(mesh.children.some((child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true)).toBe(true);
  });

  it('fan-triangulates quads and preserves corner UVs', () => {
    const source = `
v 0 0 0
v 2 0 0
v 2 2 0
v 0 2 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
o Plane
f 1/1 2/2 3/3 4/4
`;
    const result = new ObjImporter().importFromText(source);
    const mesh = result.meshes[0]!;
    const uvs = mesh.geometry.getAttribute('uv');
    expect(uvs).toBeDefined();
    expect(uvs!.count).toBeGreaterThan(0);
    expect(mesh.geometry.getIndex()!.count).toBe(6);
  });

  it('imports multiple named objects as separate meshes', () => {
    const source = `
v 0 0 0
v 1 0 0
v 0 1 0
v 2 0 0
v 3 0 0
v 2 1 0
o First
f 1 2 3
o Second
f 4 5 6
`;
    const result = new ObjImporter().importFromText(source, 'props/house.obj');
    expect(result.importedObjectCount).toBe(2);
    expect(result.sourceFileName).toBe('props/house.obj');
    expect(result.meshes.map((mesh) => mesh.name)).toEqual(
      expect.arrayContaining([expect.stringContaining('First'), expect.stringContaining('Second')]),
    );
  });

  it('builds multi-mesh import group names from the file stem', () => {
    expect(buildObjImportGroupBaseName('C:\\\\maps\\\\level01.obj')).toBe('level01');
    expect(buildObjImportGroupBaseName('house.OBJ')).toBe('house');
    expect(buildObjImportGroupBaseName('')).toBe('Imported OBJ');
    expect(buildObjImportGroupBaseName('   ')).toBe('Imported OBJ');
  });

  it('places multiple meshes under one undoable group named from the file', () => {
    const source = `
v 0 0 0
v 1 0 0
v 0 1 0
v 2 0 0
v 3 0 0
v 2 1 0
o First
f 1 2 3
o Second
f 4 5 6
`;
    const world = new THREE.Group();
    const stack = new CommandStack(16);
    const result = new ObjImporter().importFromText(source, 'props/Cottage.obj');
    const groupName = hierarchyNameAllocator.allocate(buildObjImportGroupBaseName(result.sourceFileName));
    stack.push(new CommandObjectGroup([...result.meshes], world, groupName));
    expect(world.children).toHaveLength(1);
    const group = world.children[0] as THREE.Group;
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name.startsWith('Cottage')).toBe(true);
    expect(group.children).toHaveLength(2);
    expect(group.children).toEqual(expect.arrayContaining(result.meshes));
  });

  it('round-trips a simple box through export and import', () => {
    const world = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    box.name = 'Cube';
    world.add(box);
    const exported = new ObjExporter().export(world);
    const imported = new ObjImporter().importFromText(exported);
    expect(imported.importedObjectCount).toBeGreaterThanOrEqual(1);
    const mesh = imported.meshes[0]!;
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThanOrEqual(8);
    box.geometry.dispose();
  });
});

/**
 * Returns the facing of the first triangle of an imported mesh.
 *
 * @param mesh Imported mesh.
 * @returns Unit normal from the triangle's winding.
 */
function firstTriangleNormal(mesh: THREE.Mesh): THREE.Vector3 {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const position = geometry.getAttribute('position');
  const [a, b, c] = [0, 1, 2].map((index) => new THREE.Vector3().fromBufferAttribute(position, index));
  return b!.sub(a!).cross(c!.sub(a!)).normalize();
}

describe('ObjImporter with a left-handed objmeta', () => {
  it('mirrors the data back and reverses the winding', () => {
    // A left-handed writer stores the mirrored model with each face's winding reversed.
    const rightHanded =
      '# objmeta {"v":1,"up":"+y","forward":"+z","right":"-x","unit":1}\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
    const leftHanded =
      '# objmeta {"v":1,"up":"+y","forward":"+z","right":"+x","unit":1}\nv 0 0 0\nv -1 0 0\nv 0 1 0\nf 1 3 2\n';
    const expected = new ObjImporter().importFromText(rightHanded).meshes[0]!;
    const mirrored = new ObjImporter().importFromText(leftHanded).meshes[0]!;
    const box = (mesh: THREE.Mesh) => new THREE.Box3().setFromObject(mesh);
    expect(box(mirrored).equals(box(expected))).toBe(true);
    expect(firstTriangleNormal(mirrored).distanceTo(firstTriangleNormal(expected))).toBeLessThan(1e-6);
  });
});
