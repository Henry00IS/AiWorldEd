import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type {
  EditorContextDto,
  HierarchyNodeDto,
  SelectionSummaryDto,
  SnapSettingsDto,
  SolidBrushDetailDto,
  SolidBrushSummaryDto,
  SolidCsgGroupSummaryDto,
  SolidModelDetailDto,
  SolidModelSummaryDto,
} from './editor_api_types.js';
import { boxToDto, computeBrushWorldBounds, computeModelWorldBounds, vec3ToDto } from './editor_api_math.js';
import { eulerToDegreesDto } from './editor_api_snap.js';
import { findBrush, findCsgGroup, findSolidModel, listSolidModels } from './editor_api_lookup.js';
import { solidGroupOperationToName, solidOperationToName } from './editor_api_operations.js';
import { APPLICATION_DISPLAY_NAME, APPLICATION_VERSION } from '@/application_identity.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { getSolidGroupOperation, isSolidCsgGroup } from '@/solid/model/solid_group.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { McpDetailLevel, McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/** Read-only solid model queries for EditorApi. */
export class EditorApiSolidReads {
  private readonly host: EditorApiHost;

  /**
   * Creates solid read helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Returns editor context for AI planning.
   *
   * @returns Tool result with context DTO.
   */
  getEditorContext(): McpToolResult {
    const data: EditorContextDto = {
      applicationName: APPLICATION_DISPLAY_NAME,
      version: APPLICATION_VERSION,
      coordinateSystem: 'threejs',
      handedness: 'right',
      upAxis: 'y',
      snap: this.getSnapSettingsDto(),
      undoCount: this.host.commandStack.getUndoCount(),
      redoCount: this.host.commandStack.getRedoCount(),
      solidModelCount: listSolidModels(this.host.worldObject).length,
      selection: this.buildSelectionSummary(),
    };
    return okResult('Editor context', data);
  }

  /**
   * Returns live snap settings.
   *
   * @returns Tool result with snap DTO.
   */
  getSnapSettings(): McpToolResult {
    return okResult('Snap settings', this.getSnapSettingsDto());
  }

  /**
   * Lists solid models under the world.
   *
   * @returns Tool result with model summaries.
   */
  listSolidModels(): McpToolResult {
    const models = listSolidModels(this.host.worldObject).map((model) => this.toModelSummary(model));
    return okResult(`Found ${models.length} solid model(s)`, { models });
  }

  /**
   * Returns one solid model with ordered brushes.
   *
   * @param modelId Solid model root uuid.
   * @returns Tool result with model detail.
   */
  getSolidModel(modelId: string): McpToolResult {
    const model = findSolidModel(this.host.worldObject, modelId);
    if (!model) return failResult(`Solid model not found: ${modelId}`);
    return okResult('Solid model', this.toModelDetail(model));
  }

  /**
   * Returns one brush, optionally with geometry.
   *
   * @param brushId Brush id.
   * @param detail Summary or full geometry.
   * @returns Tool result with brush detail.
   */
  getBrush(brushId: string, detail: McpDetailLevel = 'summary'): McpToolResult {
    const found = findBrush(this.host.worldObject, brushId);
    if (!found) return failResult(`Brush not found: ${brushId}`);
    const orderIndex = found.model.getBrushes().findIndex((entry) => entry.id === brushId);
    const dto = this.toBrushDetail(found.model, found.brush, orderIndex, detail);
    return okResult('Brush', dto);
  }

  /**
   * Returns solid models with nested CSG groups and brushes (outliner tree).
   *
   * @returns Tool result with hierarchy nodes.
   */
  getSceneHierarchy(): McpToolResult {
    const children = listSolidModels(this.host.worldObject).map((model) => this.toSolidModelHierarchyNode(model));
    return okResult('Scene hierarchy', { children });
  }

  /**
   * Returns the current selection as solid ids (brushes, groups, models).
   *
   * @returns Tool result with selection summary.
   */
  getSelection(): McpToolResult {
    return okResult('Selection', this.buildSelectionSummary());
  }

  /**
   * Returns one solid CSG group summary with child ids.
   *
   * @param groupId Solid CSG group uuid.
   * @returns Tool result with group DTO.
   */
  getCsgGroup(groupId: string): McpToolResult {
    const found = findCsgGroup(this.host.worldObject, groupId);
    if (!found) return failResult(`CSG group not found: ${groupId}`);
    return okResult('CSG group', this.toCsgGroupSummary(found.model, found.group));
  }

  /**
   * Builds snap settings from host systems.
   *
   * @returns Snap DTO.
   */
  private getSnapSettingsDto(): SnapSettingsDto {
    return {
      enabled: this.host.getUserSnapEnabled(),
      interval: this.host.snapManager.getInterval(),
      rotationSnapDegrees: this.host.gridSnap.getRotationSnapDegrees(),
      scaleSnapInterval: this.host.gridSnap.getScaleSnapInterval(),
    };
  }

  /**
   * Builds selection summary from selected objects (brushes and CSG groups).
   *
   * @returns Selection DTO.
   */
  private buildSelectionSummary(): SelectionSummaryDto {
    const brushIds: string[] = [];
    const groupIds: string[] = [];
    const solidModelIds = new Set<string>();
    const meshes = this.host.selectionManager.getAllSelectedObjectsAsArray();
    for (const mesh of meshes) {
      this.collectSelectionIds(mesh, brushIds, groupIds, solidModelIds);
    }
    for (const object of this.host.selectionManager.getInspectorObjects()) {
      this.collectSelectionIds(object, brushIds, groupIds, solidModelIds);
    }
    return {
      brushIds: uniqueStrings(brushIds),
      groupIds: uniqueStrings(groupIds),
      solidModelIds: Array.from(solidModelIds),
      meshCount: meshes.length,
    };
  }

  /**
   * Collects brush, group, and solid model ids for one selected object.
   *
   * @param object Selected scene object.
   * @param brushIds Accumulator for brush ids.
   * @param groupIds Accumulator for solid CSG group uuids.
   * @param solidModelIds Accumulator for model ids.
   */
  private collectSelectionIds(
    object: THREE.Object3D,
    brushIds: string[],
    groupIds: string[],
    solidModelIds: Set<string>,
  ): void {
    const model = SolidModel.fromObject(object);
    if (!model) return;
    solidModelIds.add(model.root.uuid);
    if (isSolidCsgGroup(object)) {
      groupIds.push(object.uuid);
      return;
    }
    if (!(object instanceof THREE.Mesh) || !SolidBrushVisual.isBrushObject(object)) return;
    const brush = model.findBrushByMesh(object);
    if (brush) brushIds.push(brush.id);
  }

  /**
   * Maps a solid model to a summary DTO.
   *
   * @param model Solid model.
   * @returns Summary DTO.
   */
  private toModelSummary(model: SolidModel): SolidModelSummaryDto {
    return {
      modelId: model.root.uuid,
      name: model.root.name,
      brushCount: model.getBrushCount(),
      invertedWorld: model.isInvertedWorld(),
      worldBounds: boxToDto(computeModelWorldBounds(model)),
    };
  }

  /**
   * Maps a solid model to a detail DTO with ordered brushes and hierarchy tree.
   *
   * @param model Solid model.
   * @returns Detail DTO.
   */
  private toModelDetail(model: SolidModel): SolidModelDetailDto {
    const brushes = model.getBrushes().map((brush, orderIndex) => this.toBrushSummary(model, brush, orderIndex));
    const hierarchy = this.toSolidModelHierarchyNode(model).children;
    return { ...this.toModelSummary(model), brushes, hierarchy };
  }

  /**
   * Maps a brush to a summary DTO.
   *
   * @param model Owning model.
   * @param brush Brush instance.
   * @param orderIndex CSG evaluation index.
   * @returns Summary DTO.
   */
  private toBrushSummary(model: SolidModel, brush: SolidBrushInstance, orderIndex: number): SolidBrushSummaryDto {
    brush.pullTransformFromMesh();
    return {
      brushId: brush.id,
      name: brush.name,
      operation: solidOperationToName(brush.operation),
      orderIndex,
      visible: brush.visible,
      position: vec3ToDto(brush.position),
      rotationDegrees: eulerToDegreesDto(brush.rotation),
      scale: vec3ToDto(brush.scale),
      localBounds: boxToDto(brush.brush.computeLocalBounds()),
      worldBounds: boxToDto(computeBrushWorldBounds(model, brush)),
      parentGroupId: this.resolveParentGroupId(model, brush.mesh),
    };
  }

  /**
   * Resolves the solid CSG group parent uuid for a brush mesh, if any.
   *
   * @param model Owning solid model.
   * @param mesh Brush preview mesh.
   * @returns Parent group uuid or null when under the solid root.
   */
  private resolveParentGroupId(model: SolidModel, mesh: THREE.Object3D | null): string | null {
    if (!mesh?.parent) return null;
    if (mesh.parent === model.root) return null;
    if (isSolidCsgGroup(mesh.parent)) return mesh.parent.uuid;
    return null;
  }

  /**
   * Maps a solid CSG group to a summary DTO.
   *
   * @param model Owning solid model.
   * @param group Solid CSG group.
   * @returns Group summary DTO.
   */
  private toCsgGroupSummary(model: SolidModel, group: THREE.Group): SolidCsgGroupSummaryDto {
    const childBrushIds: string[] = [];
    const childGroupIds: string[] = [];
    for (const child of group.children) {
      if (isSolidCsgGroup(child)) {
        childGroupIds.push(child.uuid);
        continue;
      }
      if (!(child instanceof THREE.Mesh) || !SolidBrushVisual.isBrushObject(child)) continue;
      const brush = model.findBrushByMesh(child);
      if (brush) childBrushIds.push(brush.id);
    }
    const parent = group.parent;
    const parentGroupId = parent && isSolidCsgGroup(parent) ? parent.uuid : null;
    return {
      groupId: group.uuid,
      name: group.name,
      operation: solidGroupOperationToName(getSolidGroupOperation(group)),
      modelId: model.root.uuid,
      parentGroupId,
      childBrushIds,
      childGroupIds,
    };
  }

  /**
   * Maps a brush to a detail DTO.
   *
   * @param model Owning model.
   * @param brush Brush instance.
   * @param orderIndex CSG evaluation index.
   * @param detail Summary or full geometry.
   * @returns Detail DTO.
   */
  private toBrushDetail(
    model: SolidModel,
    brush: SolidBrushInstance,
    orderIndex: number,
    detail: McpDetailLevel,
  ): SolidBrushDetailDto {
    const summary = this.toBrushSummary(model, brush, orderIndex);
    if (detail !== 'full') return { ...summary, modelId: model.root.uuid };
    return {
      ...summary,
      modelId: model.root.uuid,
      geometry: {
        vertices: brush.brush.vertices.map((vertex) => vec3ToDto(vertex)),
        faceCount: brush.brush.faces.length,
        planes: brush.brush.planes.map((plane) => ({
          normal: vec3ToDto(plane.normal),
          distance: plane.offset,
        })),
      },
    };
  }

  /**
   * Builds a hierarchy node for a solid model with nested CSG groups and
   * brushes.
   *
   * @param model Solid model.
   * @returns Hierarchy node matching the outliner tree.
   */
  private toSolidModelHierarchyNode(model: SolidModel): HierarchyNodeDto {
    return {
      id: model.root.uuid,
      name: model.root.name,
      kind: 'solid_model',
      children: this.collectSolidContentChildren(model, model.root),
    };
  }

  /**
   * Collects outliner-visible solid children under a solid root or CSG group.
   *
   * @param model Owning solid model.
   * @param parent Solid root or solid CSG group.
   * @returns Hierarchy child nodes in sibling order.
   */
  private collectSolidContentChildren(model: SolidModel, parent: THREE.Object3D): HierarchyNodeDto[] {
    const children: HierarchyNodeDto[] = [];
    for (const child of parent.children) {
      const node = this.toSolidContentNode(model, child);
      if (node) children.push(node);
    }
    return children;
  }

  /**
   * Maps one solid hierarchy child to a hierarchy DTO when it is content.
   *
   * @param model Owning solid model.
   * @param child Scene child under solid root or CSG group.
   * @returns Hierarchy node or null for result meshes and helpers.
   */
  private toSolidContentNode(model: SolidModel, child: THREE.Object3D): HierarchyNodeDto | null {
    if (isSolidCsgGroup(child) && child instanceof THREE.Group) {
      return {
        id: child.uuid,
        name: child.name || 'Group',
        kind: 'csg_group',
        operation: solidGroupOperationToName(getSolidGroupOperation(child)),
        children: this.collectSolidContentChildren(model, child),
      };
    }
    if (!(child instanceof THREE.Mesh) || !SolidBrushVisual.isBrushObject(child)) return null;
    const brush = model.findBrushByMesh(child);
    if (!brush) return null;
    return {
      id: brush.id,
      name: brush.name,
      kind: 'brush',
      operation: solidOperationToName(brush.operation),
      children: [],
    };
  }
}

/**
 * Builds a successful tool result.
 *
 * @param message Human-readable message.
 * @param data Optional payload.
 * @returns Tool result.
 */
function okResult(message: string, data?: unknown): McpToolResult {
  return { ok: true, message, data };
}

/**
 * Builds a failed tool result.
 *
 * @param message Error message.
 * @returns Tool result.
 */
function failResult(message: string): McpToolResult {
  return { ok: false, message };
}

/**
 * Deduplicates string ids while preserving first-seen order.
 *
 * @param values Source ids.
 * @returns Unique ids.
 */
function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
