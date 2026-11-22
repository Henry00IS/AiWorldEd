import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { SceneSerializer } from '@/io/scene/scene_serializer.js';
import { SceneDeserializer } from '@/io/scene/scene_deserializer.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { readMeshDocumentFaceTextureId } from '@/mesh/convert/mesh_document_face_texture_sync.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import {
  openTopologyMeshEditFixture,
  readTopologyMeshFixtureGeometry,
  type TopologyMeshEditFixture,
} from './support/topology_mesh_edit_fixture.js';

/** Texture painted in these tests. */
const BRICK = 'walls/brick.png';

describe('HandlerComponentMeshOperations texture assignment', () => {
  it('paints only the selected faces and undoes and redoes in one step', () => {
    const fixture = openTopologyMeshEditFixture();
    const before = readTextureIds(fixture);
    selectFaces(fixture, [0, 2]);
    expect(fixture.operations.assignTextureToSelectedFaces(BRICK)).toBe(true);
    const after = readTextureIds(fixture);
    expect(after[0]).toBe(BRICK);
    expect(after[2]).toBe(BRICK);
    expect(after.filter((_id, face) => face !== 0 && face !== 2)).toEqual(
      before.filter((_id, face) => face !== 0 && face !== 2),
    );
    expect(Array.isArray(fixture.mesh.material) && fixture.mesh.material.length).toBe(2);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTextureIds(fixture)).toEqual(before);
    expect(fixture.commandStack.redo()).toBe(true);
    expect(readTextureIds(fixture)).toEqual(after);
  });

  it('keeps the selection and adds no undo step when the faces already show the texture', () => {
    const fixture = openTopologyMeshEditFixture();
    selectFaces(fixture, [1]);
    expect(fixture.operations.assignTextureToSelectedFaces(BRICK)).toBe(true);
    expect(fixture.operations.assignTextureToSelectedFaces(BRICK)).toBe(false);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(fixture.commandStack.undo()).toBe(false);
    expect(
      fixture.session
        .getComponentSelection()
        .getSelected()
        .map((entry) => entry.componentKey),
    ).toEqual(['1']);
  });

  it('paints a whole mesh with one texture when every face is selected', () => {
    const fixture = openTopologyMeshEditFixture();
    const faces = readTopologyMeshFixtureGeometry(fixture).faces.map((_face, index) => index);
    selectFaces(fixture, faces);
    expect(fixture.operations.assignTextureToSelectedFaces(BRICK)).toBe(true);
    expect(new Set(readTextureIds(fixture))).toEqual(new Set([BRICK]));
    expect(new Set(getFaceTextureMaps(fixture.mesh).map((entry) => entry.mapping.textureId))).toEqual(new Set([BRICK]));
  });

  it('asks for Face mode and a face selection', () => {
    const fixture = openTopologyMeshEditFixture();
    expect(fixture.operations.assignTextureToSelectedFaces(BRICK)).toBe(false);
    expect(fixture.statusMessages.at(-1)).toBe('Assign Texture works in Face mode');
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    expect(fixture.operations.assignTextureToSelectedFaces(BRICK)).toBe(false);
    expect(fixture.commandStack.undo()).toBe(false);
  });

  it('takes texture picks only in Face mode on an edited mesh', () => {
    const fixture = openTopologyMeshEditFixture();
    expect(fixture.operations.takesTexturePicks()).toBe(false);
    fixture.session.setComponentMode(EditorComponentMode.FACE, []);
    expect(fixture.operations.takesTexturePicks()).toBe(true);
    fixture.session.exit();
    expect(fixture.operations.takesTexturePicks()).toBe(false);
  });

  it('keeps painted faces after leaving Edit Mode, saving and loading', () => {
    const fixture = openTopologyMeshEditFixture();
    selectFaces(fixture, [3]);
    fixture.operations.assignTextureToSelectedFaces(BRICK);
    fixture.session.exit();
    const persistent = readPersistentMeshDocument(fixture.mesh);
    expect(persistent && readMeshDocumentFaceTextureId(persistent, 3)).toBe(BRICK);
    const world = new THREE.Group();
    world.add(fixture.mesh);
    const loaded = new THREE.Group();
    new SceneDeserializer().deserialize(JSON.parse(JSON.stringify(new SceneSerializer().serialize(world))), loaded);
    const document = readPersistentMeshDocument(loaded.children[0]!);
    expect(document && readMeshDocumentFaceTextureId(document, 3)).toBe(BRICK);
    expect(document && readMeshDocumentFaceTextureId(document, 0)).not.toBe(BRICK);
  });
});

/**
 * Selects faces in Face mode.
 *
 * @param fixture Live fixture.
 * @param faces Face indices.
 */
function selectFaces(fixture: TopologyMeshEditFixture, faces: readonly number[]): void {
  fixture.session.setComponentMode(EditorComponentMode.FACE, []);
  fixture.session
    .getComponentSelection()
    .replaceAll(
      faces.map((face) => ({ targetId: fixture.targetId, kind: 'face' as const, componentKey: String(face) })),
    );
}

/**
 * Reads the texture of every face of the edited mesh.
 *
 * @param fixture Live fixture.
 * @returns Texture id per face.
 */
function readTextureIds(fixture: TopologyMeshEditFixture): string[] {
  return readTopologyMeshFixtureGeometry(fixture).faces.map((face) => face.textureId);
}
