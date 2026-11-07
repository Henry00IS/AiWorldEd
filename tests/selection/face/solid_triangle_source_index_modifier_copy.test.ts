import { describe, expect, it } from 'vitest';
import { findSameSolidBrushSurfaceIndicesFast } from '@/selection/face/solid_triangle_source_index.js';
import { ManagerFaceSelection } from '@/selection/face/manager_face_selection.js';
import { stackUvFaceTriangles, stackUvFixtureMirror } from '../../modifier/stack/modifier_stack_uv_fixture.js';

describe('solid face selection with modifier copies', () => {
  it('clicking an authored face selects only its own triangles, never its mirrored copy', () => {
    const fixture = stackUvFixtureMirror();
    const authored = stackUvFaceTriangles(fixture.model, fixture.source.id, 0, false);
    const copies = stackUvFaceTriangles(fixture.model, fixture.source.id, 0, true);
    expect(authored.length).toBeGreaterThan(0);
    expect(copies.length).toBeGreaterThan(0);
    const expanded = findSameSolidBrushSurfaceIndicesFast(fixture.model.getResultMesh(), authored[0]!);
    expect(expanded).toEqual(authored);
  });

  it('a copy triangle groups only with its own copy face', () => {
    const fixture = stackUvFixtureMirror();
    const copies = stackUvFaceTriangles(fixture.model, fixture.source.id, 0, true);
    const expanded = findSameSolidBrushSurfaceIndicesFast(fixture.model.getResultMesh(), copies[0]!);
    expect(expanded).toEqual(copies);
  });

  it('the face selection refuses copy triangles and keeps them out of an authored selection', () => {
    const fixture = stackUvFixtureMirror();
    const resultMesh = fixture.model.getResultMesh();
    const authored = stackUvFaceTriangles(fixture.model, fixture.source.id, 0, false);
    const copies = stackUvFaceTriangles(fixture.model, fixture.source.id, 0, true);
    const manager = new ManagerFaceSelection();
    manager.selectFace(resultMesh, copies[0]!, false);
    expect(manager.getSelectedFaces()).toEqual([]);
    manager.selectFace(resultMesh, authored[0]!, false);
    expect(manager.getSelectedFaces().length).toBe(1);
    expect(authored.every((triangle) => manager.isFaceSelected(resultMesh, triangle))).toBe(true);
    expect(copies.some((triangle) => manager.isFaceSelected(resultMesh, triangle))).toBe(false);
  });
});
