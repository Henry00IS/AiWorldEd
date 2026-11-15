import * as THREE from 'three';
import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';
import type { EditorApiHost } from '@/ai/client/editor_api_host.js';
import { findBrush } from '@/ai/client/editor_api_lookup.js';
import { failResult, okResult } from '@/ai/client/editor_api_result.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import {
  CommandTextureFaceApply,
  type ApplyFaceTextureCommandOptions,
} from '@/texture/commands/command_texture_face_apply.js';
import { CommandTextureSolidFaceAssign } from '@/texture/commands/command_texture_solid_face_assign.js';
import { textureChoicesList, TEXTURE_CHOICE_MISSING_SUFFIX } from '@/texture/library/texture_choices.js';
import type { FaceTextureMappingTrs } from '@/texture/uv/face_texture_mapping.js';
import { getCommonTrsFieldState } from '@/texture/uv/face_texture_applier.js';
import { buildTargetsFromSolidBrushMesh } from '@/texture/uv/solid_brush_texture_targets.js';

/** Brush faces a texture or UV tool works on. */
export interface TextureFacesArgs {
  brushIds: string[];
  /** Brush face (surface) indices from texture_face_list; omit for every face. */
  surfaceIndices?: number[];
}

/**
 * Lists textures and edits brush face textures and UVs through the UV editor's
 * commands.
 */
export class EditorApiTexture {
  /**
   * Creates the texture part.
   *
   * @param host Injected editor systems.
   */
  constructor(private readonly host: EditorApiHost) {}

  /**
   * Lists the library's textures and the ones the level uses whose files are
   * missing.
   *
   * @param filter Optional case-insensitive text the id or label contains.
   * @returns Texture ids and labels.
   */
  textureList(filter?: string): McpToolResult {
    const needle = filter?.toLowerCase() ?? '';
    const textures = textureChoicesList()
      .filter((choice) => !needle || `${choice.value} ${choice.label}`.toLowerCase().includes(needle))
      .map((choice) => ({
        textureId: choice.value,
        label: choice.label,
        missing: choice.label.endsWith(TEXTURE_CHOICE_MISSING_SUFFIX),
      }));
    return okResult(`${textures.length} texture(s)`, { textures });
  }

  /**
   * Lists a brush's faces with world normal, center, texture and UV fields.
   *
   * @param brushId Brush id.
   * @returns Faces.
   */
  faceList(brushId: string): McpToolResult {
    const found = findBrush(this.host.worldObject, brushId);
    if (!found) return failResult(`Brush not found: ${brushId}`);
    const faces = this.faceGeometry(found.model, found.brush).map((face) => ({
      ...face,
      ...this.faceMapping(found.brush, face.surfaceIndex),
    }));
    return okResult(`${faces.length} face(s) of ${found.brush.name}`, { brushId, faces });
  }

  /**
   * Assigns a texture to brush faces, keeping their UVs.
   *
   * @param faces Brushes and faces.
   * @param textureId Texture id from texture_list.
   * @returns Result.
   */
  faceAssign(faces: TextureFacesArgs, textureId: string): McpToolResult {
    if (!textureId) return failResult('textureId is required; see texture_list');
    const targets: { model: SolidModel; brushId: string; surfaceIndex: number }[] = [];
    for (const brushId of faces.brushIds) {
      const found = findBrush(this.host.worldObject, brushId);
      if (!found) return failResult(`Brush not found: ${brushId}`);
      const surfaces = faces.surfaceIndices ?? found.brush.brush.planes.map((_plane, index) => index);
      const bad = surfaces.filter((index) => !found.brush.brush.planes[index]);
      if (bad.length > 0)
        return failResult(`${brushId} has no face ${bad.join(', ')} (${found.brush.brush.planes.length} faces)`);
      targets.push(...surfaces.map((surfaceIndex) => ({ model: found.model, brushId, surfaceIndex })));
    }
    this.host.commandStack.push(new CommandTextureSolidFaceAssign(targets, textureId));
    return this.done(`Assigned ${textureId} to ${targets.length} face(s)`);
  }

  /**
   * Sets absolute UV fields (and optionally the projection) on brush faces.
   *
   * @param faces Brushes and faces.
   * @param fields Scale, offset and rotation to write; others stay.
   * @returns Result.
   */
  uvSet(faces: TextureFacesArgs, fields: Partial<FaceTextureMappingTrs>): McpToolResult {
    if (Object.keys(fields).length === 0)
      return failResult('Give at least one of scaleU, scaleV, offsetU, offsetV, rotationDeg');
    return this.uvApply(faces, { partialTrs: fields }, 'Set UVs');
  }

  /**
   * Applies a UV editor button: align, reset or a relative step.
   *
   * @param faces Brushes and faces.
   * @param options Command options.
   * @param label Status text.
   * @returns Result.
   */
  uvApply(faces: TextureFacesArgs, options: ApplyFaceTextureCommandOptions, label: string): McpToolResult {
    const targets = [];
    for (const brushId of faces.brushIds) {
      const found = findBrush(this.host.worldObject, brushId);
      if (!found?.brush.mesh) return failResult(`Brush not found: ${brushId}`);
      targets.push(...buildTargetsFromSolidBrushMesh(found.brush.mesh, faces.surfaceIndices));
    }
    if (targets.length === 0)
      return failResult('None of those faces is visible in the built result (carved away or not built yet)');
    this.host.commandStack.push(new CommandTextureFaceApply(targets, undefined, options));
    return this.done(`${label} on ${targets.length} face(s)`);
  }

  /**
   * Returns each face's world normal and center.
   *
   * @param model Owning model.
   * @param brush Brush.
   * @returns Face geometry rows.
   */
  private faceGeometry(
    model: SolidModel,
    brush: SolidBrushInstance,
  ): { surfaceIndex: number; normal: THREE.Vector3; center: THREE.Vector3 }[] {
    model.root.updateMatrixWorld(true);
    const world = model.root.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    const shape = brush.getModelSpaceBrush();
    return shape.faces.map((face) => {
      const vertices = shape.getFaceVertices(face);
      const center = vertices
        .reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
        .divideScalar(Math.max(1, vertices.length))
        .applyMatrix4(world);
      const normal = (shape.planes[face.surfaceIndex]?.normal.clone() ?? new THREE.Vector3())
        .applyMatrix3(normalMatrix)
        .normalize();
      return { surfaceIndex: face.surfaceIndex, normal: this.rounded(normal), center: this.rounded(center) };
    });
  }

  /**
   * Returns a face's texture and the UV fields the UV editor shows for it; a
   * face carved away from the built result reports visible false and no UVs.
   *
   * @param brush Brush.
   * @param surfaceIndex Face.
   * @returns Visibility, texture id, align and UV fields.
   */
  private faceMapping(brush: SolidBrushInstance, surfaceIndex: number): Record<string, unknown> {
    const targets = brush.mesh ? buildTargetsFromSolidBrushMesh(brush.mesh, [surfaceIndex]) : [];
    const textureId = brush.getSurfaceTextureId(surfaceIndex);
    if (targets.length === 0) return { visible: false, textureId };
    const state = getCommonTrsFieldState(targets);
    const round = (value: number | null): number | null => (value === null ? null : Math.round(value * 1e4) / 1e4);
    return {
      visible: true,
      textureId,
      align: state.align,
      scaleU: round(state.scaleU),
      scaleV: round(state.scaleV),
      offsetU: round(state.offsetU),
      offsetV: round(state.offsetV),
      rotationDeg: round(state.rotationDeg),
    };
  }

  /**
   * Rounds a vector for readable output.
   *
   * @param vector Vector.
   * @returns Same vector, rounded to 1e-4.
   */
  private rounded(vector: THREE.Vector3): THREE.Vector3 {
    return vector.set(
      Math.round(vector.x * 1e4) / 1e4,
      Math.round(vector.y * 1e4) / 1e4,
      Math.round(vector.z * 1e4) / 1e4,
    );
  }

  /**
   * Refreshes the editor after a change.
   *
   * @param message Status text.
   * @returns Result.
   */
  private done(message: string): McpToolResult {
    this.host.refreshAfterWorldMutation();
    this.host.showStatus(message);
    return okResult(message);
  }
}
