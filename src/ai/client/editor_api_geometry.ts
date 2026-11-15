import * as THREE from 'three';
import type { McpToolResult, McpVec3 } from '@/ai/shared/mcp_protocol_types.js';
import { CommandUndoBatch } from '@/commands/command_undo_batch.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import { CommandSolidModelCreate } from '@/solid/commands/model/command_solid_model_create.js';
import { CommandSolidTreeAdd } from '@/solid/commands/tree/command_solid_tree_add.js';
import type { SolidTreeNode } from '@/solid/commands/tree/solid_tree_node.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { EditorApiHost } from './editor_api_host.js';
import { findCsgGroup, findSolidModel } from './editor_api_lookup.js';
import { dtoToVec3 } from './editor_api_math.js';
import { nameToSolidOperation, solidOperationToName } from './editor_api_operations.js';
import { failResult, okResult } from './editor_api_result.js';
import { solidScriptProgramEvaluate } from '@/solid_script/language/solid_script_program.js';
import { solidScriptSolidTreeBuild } from '@/solid_script/language/solid_script_solid_tree.js';
import { geometryScriptLinesRead } from './editor_api_geometry_script.js';
import { solidScriptShapeMeshes } from '@/solid_script/language/solid_script_mesh.js';
import {
  solidScriptMeshDocumentBuild,
  type SolidScriptMeshDocument,
} from '@/solid_script/output/solid_script_mesh_document.js';
import { contentMeshImportCreate, contentMeshImportFinalize } from '@/io/geometry/content_mesh_import.js';
import { CommandPrimitiveCreate } from '@/tools/creation/commands/command_primitive_create.js';

/** UserData key marking meshes a script built through the assistant tools. */
const EDITOR_API_SCRIPT_MESH_KEY = 'isScriptMesh';

/** What a script run would add. */
interface GeometryBuildPlan {
  nodes: SolidTreeNode[];
  meshes: SolidScriptMeshDocument[];
  messages: string[];
}

/** Arguments of geometry_script_build and geometry_script_preview. */
export interface GeometrySolidScriptArgs {
  lines: unknown;
  modelId?: string;
  parentGroupId?: string;
  name?: string;
  position?: McpVec3;
  operation?: string;
  upAxis?: string;
}

/** Where a build lands: an existing model and parent, or a new model. */
interface GeometryTarget {
  model: SolidModel;
  parent: THREE.Object3D;
  created: boolean;
}

/** Builds solids from geometry description languages through one undo step. */
export class EditorApiGeometry {
  /**
   * Creates the geometry part.
   *
   * @param host Injected editor systems.
   */
  constructor(private readonly host: EditorApiHost) {}

  /**
   * Runs SolidScript lines and reports what a build would create.
   *
   * @param args Build arguments.
   * @returns Outline of the brushes and groups, nothing is changed.
   */
  solidScriptPreview(args: GeometrySolidScriptArgs): McpToolResult {
    const target = this.targetResolve(args);
    if (typeof target === 'string') return failResult(target);
    const plan = this.planBuild(args, target.parent);
    if (typeof plan === 'string') return failResult(plan);
    return okResult(`Would create ${this.brushCount(plan.nodes)} brush(es) and ${plan.meshes.length} mesh(es)`, {
      tree: this.outline(plan.nodes),
      meshes: plan.meshes.map((mesh) => ({
        mesh: mesh.name,
        vertices: mesh.document.getTopology().getVertexCount(),
        faces: mesh.document.getTopology().getFaceCount(),
      })),
      messages: plan.messages,
    });
  }

  /**
   * Runs SolidScript lines and adds the result as CSG brushes and groups.
   *
   * @param args Build arguments.
   * @returns Created model, group and brush ids.
   */
  solidScriptBuild(args: GeometrySolidScriptArgs): McpToolResult {
    const target = this.targetResolve(args);
    if (typeof target === 'string') return failResult(target);
    const plan = this.planBuild(args, target.parent);
    if (typeof plan === 'string') return failResult(plan);
    if (plan.nodes.length === 0 && plan.meshes.length === 0) return failResult('The script builds no solids or meshes');
    const command = plan.nodes.length > 0 ? new CommandSolidTreeAdd(target.model, plan.nodes, target.parent) : null;
    const meshes = plan.meshes.map((mesh) => this.meshCreate(mesh));
    const steps: UndoCommand[] = [
      ...(command && target.created ? [new CommandSolidModelCreate(target.model, this.host.worldObject)] : []),
      ...(command ? [command] : []),
      ...meshes.map((mesh) => new CommandPrimitiveCreate(mesh, this.host.worldObject)),
    ];
    this.host.commandStack.push(steps.length === 1 ? steps[0]! : new CommandUndoBatch(steps));
    return this.buildResult(command ? target.model : null, command, meshes, plan.messages);
  }

  /**
   * Makes a regular mesh object from a script mesh, finished in place under the
   * world but not added yet.
   *
   * @param output Script mesh in world coordinates.
   * @returns Mesh object.
   */
  private meshCreate(output: SolidScriptMeshDocument): THREE.Mesh {
    const mesh = contentMeshImportCreate(output.document, output.name, EDITOR_API_SCRIPT_MESH_KEY);
    this.host.worldObject.add(mesh);
    contentMeshImportFinalize(mesh, output.hasUvs);
    this.host.worldObject.remove(mesh);
    return mesh;
  }

  /**
   * Resolves the destination model and parent, creating a model when none is
   * named.
   *
   * @param args Build arguments.
   * @returns Target, or an error message.
   */
  private targetResolve(args: GeometrySolidScriptArgs): GeometryTarget | string {
    if (!args.modelId) {
      if (args.parentGroupId) return 'parentGroupId needs modelId';
      const model = new SolidModel(args.name?.trim() || undefined);
      return { model, parent: model.root, created: true };
    }
    const model = findSolidModel(this.host.worldObject, args.modelId);
    if (!model) return `Solid model not found: ${args.modelId}`;
    if (!args.parentGroupId) return { model, parent: model.root, created: false };
    const found = findCsgGroup(this.host.worldObject, args.parentGroupId);
    if (!found || found.model !== model) return `CSG group not found under model: ${args.parentGroupId}`;
    return { model, parent: found.group, created: false };
  }

  /**
   * Runs the script lines and maps the result onto solid nodes.
   *
   * @param args Build arguments.
   * @param parent Insertion parent.
   * @returns Nodes and echo messages, or an error message.
   */
  private planBuild(args: GeometrySolidScriptArgs, parent: THREE.Object3D): GeometryBuildPlan | string {
    const operation = args.operation === undefined ? undefined : nameToSolidOperation(args.operation);
    if (operation === null) return 'operation must be additive, subtractive or intersecting';
    if (args.upAxis !== undefined && args.upAxis !== 'z' && args.upAxis !== 'y') return "upAxis must be 'z' or 'y'";
    parent.updateWorldMatrix(true, false);
    try {
      const blocks = geometryScriptLinesRead(args.lines);
      if (typeof blocks === 'string') return blocks;
      const { shapes, messages } = solidScriptProgramEvaluate({ blocks });
      const upAxis = args.upAxis === 'y' ? 'y' : 'z';
      const offset = dtoToVec3(args.position, new THREE.Vector3());
      const nodes = solidScriptSolidTreeBuild(shapes, {
        upAxis,
        offset,
        worldToParent: parent.matrixWorld.clone().invert(),
        operation: operation ?? SolidOperation.Additive,
        namePrefix: args.modelId ? (args.name?.trim() ?? '') : '',
      });
      this.host.worldObject.updateWorldMatrix(true, false);
      const toWorld = this.host.worldObject.matrixWorld
        .clone()
        .invert()
        .multiply(new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z));
      const meshes = solidScriptShapeMeshes(shapes).map((mesh) => solidScriptMeshDocumentBuild(mesh, upAxis, toWorld));
      return { nodes, meshes, messages };
    } catch (error) {
      return `Script: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Selects the new brushes, refreshes the UI and builds the tool result.
   *
   * @param model Target model.
   * @param command Executed tree command.
   * @param messages Echo messages.
   * @returns Tool result.
   */
  private buildResult(
    model: SolidModel | null,
    command: CommandSolidTreeAdd | null,
    meshes: readonly THREE.Mesh[],
    messages: string[],
  ): McpToolResult {
    const brushes = command?.getBrushes() ?? [];
    this.host.selectionManager.setSelection([
      ...brushes.flatMap((brush) => (brush.mesh ? [brush.mesh] : [])),
      ...meshes,
    ]);
    this.host.refreshAfterWorldMutation();
    this.host.refreshOutliner();
    this.host.showStatus(`Built ${brushes.length} brush(es) and ${meshes.length} mesh(es)`);
    const groups = (command?.getRootObjects() ?? []).filter((object) => !(object instanceof THREE.Mesh));
    return okResult(
      `Built ${brushes.length} brush(es)${model ? ` in ${model.root.name}` : ''} and ${meshes.length} mesh(es)`,
      {
        modelId: model?.root.uuid ?? null,
        rootGroupIds: groups.map((group) => group.uuid),
        brushes: brushes.map((brush) => ({
          brushId: brush.id,
          name: brush.name,
          operation: solidOperationToName(brush.operation),
        })),
        meshes: meshes.map((mesh) => ({ meshId: mesh.uuid, name: mesh.name })),
        messages,
      },
      {
        createdIds: [
          ...(model ? [model.root.uuid] : []),
          ...brushes.map((brush) => brush.id),
          ...meshes.map((mesh) => mesh.uuid),
        ],
      },
    );
  }

  /**
   * Counts brushes in a subtree.
   *
   * @param nodes Nodes.
   * @returns Count.
   */
  private brushCount(nodes: readonly SolidTreeNode[]): number {
    return nodes.reduce((sum, node) => sum + (node.kind === 'brush' ? 1 : this.brushCount(node.children)), 0);
  }

  /**
   * Describes a subtree for previews.
   *
   * @param nodes Nodes.
   * @returns Plain outline with names, operations and brush centers.
   */
  private outline(nodes: readonly SolidTreeNode[]): unknown[] {
    return nodes.map((node) =>
      node.kind === 'brush'
        ? { brush: node.name, operation: solidOperationToName(node.operation), center: node.center.toArray() }
        : { group: node.name, operation: solidOperationToName(node.operation), children: this.outline(node.children) },
    );
  }
}
