import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { topologyFaceAreaVector } from '@/edit/topology/topology_face_region.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import {
  openTopologyMeshEditFixture,
  readTopologyMeshFixtureGeometry,
  type TopologyMeshEditFixture,
} from './support/topology_mesh_edit_fixture.js';

describe('HandlerComponentMeshOperations extrude', () => {
  it('extrudes the selected face, keeps it selected and undoes in one step', () => {
    const fixture = openFaceFixture();
    const before = readTopologyMeshFixtureGeometry(fixture);
    const facesBefore = before.faces.length;
    const corners = before.faces[0]!.vertexIndices.length;
    expect(fixture.operations.extrudeSelectedFaces(0.5, 'region')).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(facesBefore + corners);
    expect(
      fixture.session
        .getComponentSelection()
        .getSelected()
        .map((entry) => entry.componentKey),
    ).toEqual(['0']);
    expect(fixture.commandStack.undo()).toBe(true);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(facesBefore);
  });

  it('measures the distance in world units on a scaled mesh', () => {
    const fixture = openFaceFixture();
    const scale = 2 + Math.random();
    fixture.mesh.scale.setScalar(scale);
    fixture.mesh.updateMatrixWorld(true);
    const before = worldFaceCentre(fixture, readTopologyMeshFixtureGeometry(fixture), 0);
    const axis = fixture.operations.describeFaceExtrudeAxis();
    expect(axis).not.toBeNull();
    const distance = 0.3 + Math.random();
    fixture.operations.extrudeSelectedFaces(-distance, 'region');
    const after = worldFaceCentre(fixture, readTopologyMeshFixtureGeometry(fixture), 0);
    expect(after.sub(before).dot(axis!.direction)).toBeCloseTo(-distance, 6);
  });

  it('points the drag axis along the face normal and previews without editing', () => {
    const fixture = openFaceFixture();
    const geometry = readTopologyMeshFixtureGeometry(fixture);
    const normal = topologyFaceAreaVector(geometry, 0).normalize();
    expect(fixture.operations.describeFaceExtrudeAxis()!.direction.dot(normal)).toBeCloseTo(1, 6);
    const segments = fixture.operations.previewFaceExtrude(1, 'region');
    expect(segments.length).toBe(2 * 3 * geometry.faces[0]!.vertexIndices.length);
    expect(readTopologyMeshFixtureGeometry(fixture).faces.length).toBe(geometry.faces.length);
  });

  it('does nothing outside Face mode', () => {
    const fixture = openTopologyMeshEditFixture();
    expect(fixture.operations.extrudeSelectedFaces(1, 'region')).toBe(false);
    expect(fixture.operations.describeFaceExtrudeAxis()).toBeNull();
  });
});

/**
 * Opens a mesh fixture in Face mode with face 0 selected.
 *
 * @returns Fixture.
 */
function openFaceFixture(): TopologyMeshEditFixture {
  const fixture = openTopologyMeshEditFixture();
  fixture.session.setComponentMode(EditorComponentMode.FACE, []);
  fixture.session.getComponentSelection().replaceAll([{ targetId: fixture.targetId, kind: 'face', componentKey: '0' }]);
  return fixture;
}

/**
 * Returns the world centre of one face.
 *
 * @param fixture Fixture.
 * @param geometry Working geometry.
 * @param face Face index.
 * @returns World centre.
 */
function worldFaceCentre(
  fixture: TopologyMeshEditFixture,
  geometry: TopologyWorkingGeometry,
  face: number,
): THREE.Vector3 {
  const loop = geometry.faces[face]!.vertexIndices;
  return loop
    .reduce((sum, vertex) => sum.add(geometry.positions[vertex]!), new THREE.Vector3())
    .divideScalar(loop.length)
    .applyMatrix4(fixture.mesh.matrixWorld);
}
