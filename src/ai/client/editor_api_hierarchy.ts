import * as THREE from 'three';
import type { EditorApiHost } from './editor_api_host.js';
import type {
  CreateCsgGroupArgs,
  ReparentSolidNodesArgs,
  RenameGroupArgs,
  SetGroupOperationArgs,
  UngroupCsgGroupsArgs,
} from './editor_api_types.js';
import {
  findCsgGroup,
  findSolidModel,
  resolveSolidHierarchyNodes,
  resolveSolidTreeParent,
} from './editor_api_lookup.js';
import { nameToSolidGroupOperation, solidGroupOperationToName } from './editor_api_operations.js';
import { CommandObjectGroup } from '@/outliner/commands/command_object_group.js';
import { CommandObjectRename } from '@/outliner/commands/command_object_rename.js';
import { CommandObjectUngroup } from '@/outliner/commands/command_object_ungroup.js';
import { CommandObjectObjectsReparent } from '@/outliner/commands/command_object_objects_reparent.js';
import { CommandSolidGroupOperationSet } from '@/solid/commands/group/command_solid_group_operation_set.js';
import { isSolidCsgGroup, isValidSolidTreeParent, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { hierarchySeedBrushIdsCollectUnderRoots } from '@/solid/model/hierarchy/solid_hierarchy_mutation_refresh.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { collapseToHierarchyRoots, findCommonParent } from '@/utils/hierarchy_selection.js';
import type { McpSolidGroupOperationName, McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/** Solid CSG group hierarchy mutations for EditorApi / MCP. */
export class EditorApiHierarchy {
  private readonly host: EditorApiHost;
  private groupCounter = 0;

  /**
   * Creates hierarchy helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Groups solid brushes and/or nested CSG groups into a new solid CSG
   * compound.
   *
   * @param args Create-group arguments.
   * @returns Tool result with new group id.
   */
  createCsgGroup(args: CreateCsgGroupArgs): McpToolResult {
    const model = findSolidModel(this.host.worldObject, args.modelId);
    if (!model) return fail(`Solid model not found: ${args.modelId}`);
    const operation = this.resolveCreateOperation(args.operation);
    if (operation === null) return fail(`Invalid operation: ${args.operation}`);
    const roots = this.resolveCreateRoots(args, model);
    if ('error' in roots) return fail(roots.error);
    const parent = this.resolveCreateParent(model, args.parentGroupId, roots);
    if (!parent) return fail('Invalid parentGroupId for this solid model');
    if (this.createWouldCycle(roots, parent)) {
      return fail('parentGroupId must not be a member or nested under a member');
    }
    return this.executeCreateCsgGroup(model, roots, parent, args.name, operation);
  }

  /**
   * Sets CSG operations on solid compound groups.
   *
   * @param args Group operation arguments.
   * @returns Tool result.
   */
  setGroupOperation(args: SetGroupOperationArgs): McpToolResult {
    const operation = nameToSolidGroupOperation(args.operation);
    if (operation === null) return fail(`Invalid operation: ${args.operation}`);
    const groups = this.resolveGroups(args.groupIds);
    if (groups.length === 0) return fail('No matching solid CSG groups found');
    this.host.commandStack.push(new CommandSolidGroupOperationSet(groups, operation));
    this.afterMutation(`Set group operation to ${args.operation}`);
    return {
      ok: true,
      message: `Set operation to ${args.operation} on ${groups.length} group(s)`,
      data: { count: groups.length, groupIds: groups.map((group) => group.uuid) },
    };
  }

  /**
   * Ungroups solid CSG compounds; children move to the former parent.
   *
   * @param args Ungroup arguments.
   * @returns Tool result.
   */
  ungroupCsgGroups(args: UngroupCsgGroupsArgs): McpToolResult {
    const groups = this.resolveGroups(args.groupIds);
    if (groups.length === 0) return fail('No matching solid CSG groups found');
    const seedsByModel = new Map<SolidModel, THREE.Object3D[]>();
    for (const group of groups) {
      const model = SolidModel.fromObject(group);
      if (model) {
        const seeds = seedsByModel.get(model) ?? [];
        seeds.push(...group.children);
        seedsByModel.set(model, seeds);
      }
      this.host.commandStack.push(new CommandObjectUngroup(group));
    }
    for (const [model, seeds] of seedsByModel) {
      this.rebuildModel(model, seeds);
    }
    this.afterMutation(`Ungrouped ${groups.length} group(s)`);
    return {
      ok: true,
      message: `Ungrouped ${groups.length} group(s)`,
      data: { count: groups.length },
    };
  }

  /**
   * Reparents solid brushes and/or CSG groups under a solid root or CSG group.
   *
   * @param args Reparent arguments.
   * @returns Tool result.
   */
  reparentSolidNodes(args: ReparentSolidNodesArgs): McpToolResult {
    if (!Array.isArray(args.nodeIds) || args.nodeIds.length === 0) {
      return fail('nodeIds must be a non-empty array of brush ids and/or group uuids');
    }
    const destination = resolveSolidTreeParent(this.host.worldObject, args.parentId);
    if (!destination) return fail(`Parent not found: ${args.parentId}`);
    const nodes = resolveSolidHierarchyNodes(this.host.worldObject, args.nodeIds);
    if (nodes.length === 0) return fail('No matching brushes or CSG groups found');
    const insertBefore = this.resolveInsertBefore(destination.model, args.nodeIdBefore);
    const moves = this.buildReparentMoves(nodes, destination, insertBefore);
    if (moves.length === 0) return fail('No valid reparent moves (same solid model required)');
    this.host.commandStack.push(new CommandObjectObjectsReparent(moves));
    this.rebuildModel(
      destination.model,
      moves.map((move) => move.object),
    );
    this.afterMutation(`Reparented ${moves.length} node(s)`);
    return {
      ok: true,
      message: `Reparented ${moves.length} node(s)`,
      data: {
        count: moves.length,
        parentId: args.parentId,
        nodeIds: moves.map((move) => this.nodeIdForObject(move.object, destination.model)),
      },
    };
  }

  /**
   * Renames a solid CSG group (undoable).
   *
   * @param args Rename arguments.
   * @returns Tool result.
   */
  renameGroup(args: RenameGroupArgs): McpToolResult {
    const name = args.name?.trim();
    if (!name) return fail('name must be a non-empty string');
    const found = findCsgGroup(this.host.worldObject, args.groupId);
    if (!found) return fail(`CSG group not found: ${args.groupId}`);
    this.host.commandStack.push(new CommandObjectRename(found.group, name));
    this.afterMutation(`Renamed group to ${name}`);
    return {
      ok: true,
      message: `Renamed group to ${name}`,
      data: { groupId: args.groupId, name },
    };
  }

  /**
   * Resolves hierarchy roots for csg_group_create after validation.
   *
   * @param args Create arguments.
   * @param model Expected solid model.
   * @returns Roots or error message.
   */
  private resolveCreateRoots(args: CreateCsgGroupArgs, model: SolidModel): THREE.Object3D[] | { error: string } {
    const ids = [...(args.brushIds ?? []), ...(args.groupIds ?? [])];
    const members = resolveSolidHierarchyNodes(this.host.worldObject, ids).map((entry) => entry.node);
    if (members.length === 0) {
      return { error: 'Provide brushIds and/or groupIds that belong to the solid model' };
    }
    if (!this.membersShareModel(members, model)) {
      return { error: 'All members must belong to the same solid model' };
    }
    return collapseToHierarchyRoots(members);
  }

  /**
   * Parses csg_group_create operation; default additive when omitted.
   *
   * @param name Optional operation name.
   * @returns Solid operation or null when invalid.
   */
  private resolveCreateOperation(name: string | undefined): SolidOperation | null {
    if (name === undefined) return SolidOperation.Additive;
    return nameToSolidGroupOperation(name);
  }

  /**
   * Runs CommandObjectGroup, marks the solid CSG group, and rebuilds the model.
   *
   * @param model Owning solid model.
   * @param roots Hierarchy roots to group.
   * @param parent Destination parent.
   * @param nameArg Optional display name.
   * @param operation Branch CSG operation.
   * @returns Success tool result.
   */
  private executeCreateCsgGroup(
    model: SolidModel,
    roots: THREE.Object3D[],
    parent: THREE.Object3D,
    nameArg: string | undefined,
    operation: SolidOperation,
  ): McpToolResult {
    const name = nameArg?.trim() || this.nextGroupName();
    const command = new CommandObjectGroup(roots, parent, name);
    this.host.commandStack.push(command);
    const group = command.getGroup();
    markAsSolidCsgGroup(group, operation);
    this.rebuildModel(model, [group]);
    this.afterMutation(`Created CSG group ${name}`);
    return this.buildCreateCsgGroupResult(model, group, operation, roots.length);
  }

  /**
   * Builds the success payload for csg_group_create.
   *
   * @param model Owning solid model.
   * @param group Created group.
   * @param operation Branch operation.
   * @param memberCount Number of hierarchy roots grouped.
   * @returns Tool result.
   */
  private buildCreateCsgGroupResult(
    model: SolidModel,
    group: THREE.Group,
    operation: SolidOperation,
    memberCount: number,
  ): McpToolResult {
    const operationName: McpSolidGroupOperationName = solidGroupOperationToName(operation);
    return {
      ok: true,
      message: `Created CSG group ${group.name}`,
      createdIds: [group.uuid],
      data: {
        groupId: group.uuid,
        name: group.name,
        modelId: model.root.uuid,
        operation: operationName,
        memberCount,
      },
    };
  }

  /**
   * Returns true when parenting a new group under parent with these members
   * would create a scene-graph cycle.
   *
   * @param members Hierarchy roots being grouped.
   * @param parent Destination parent for the new group.
   * @returns True when parent is a member or lives under a member.
   */
  private createWouldCycle(members: readonly THREE.Object3D[], parent: THREE.Object3D): boolean {
    for (const member of members) {
      if (member === parent) return true;
      if (this.isUnderAncestor(parent, member)) return true;
    }
    return false;
  }

  /**
   * Returns whether node equals ancestor or sits under ancestor in the parent
   * chain.
   *
   * @param node Candidate node (usually the destination parent).
   * @param ancestor Proposed ancestor (a group member).
   * @returns True when node is ancestor or a descendant of ancestor.
   */
  private isUnderAncestor(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = node;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Returns whether every member belongs to the expected solid model.
   *
   * @param members Hierarchy members.
   * @param model Expected solid model.
   * @returns True when all members share the model.
   */
  private membersShareModel(members: THREE.Object3D[], model: SolidModel): boolean {
    return members.every((member) => SolidModel.fromObject(member) === model);
  }

  /**
   * Chooses the parent for a new group: explicit parentGroupId, else common
   * parent of members (clamped to solid root / CSG groups).
   *
   * @param model Solid model.
   * @param parentGroupId Optional parent group uuid.
   * @param members Objects being grouped.
   * @returns Parent object or null when invalid.
   */
  private resolveCreateParent(
    model: SolidModel,
    parentGroupId: string | undefined,
    members: THREE.Object3D[],
  ): THREE.Object3D | null {
    if (parentGroupId) {
      const found = findCsgGroup(this.host.worldObject, parentGroupId);
      if (!found || found.model !== model) return null;
      return found.group;
    }
    const common = findCommonParent(members, model.root);
    if (common === model.root || isSolidCsgGroup(common)) return common;
    return model.root;
  }

  /**
   * Resolves solid CSG groups by uuid.
   *
   * @param groupIds Group uuids.
   * @returns Matching groups.
   */
  private resolveGroups(groupIds: string[]): THREE.Group[] {
    if (!Array.isArray(groupIds)) return [];
    const groups: THREE.Group[] = [];
    for (const groupId of groupIds) {
      const found = findCsgGroup(this.host.worldObject, groupId);
      if (found) groups.push(found.group);
    }
    return groups;
  }

  /**
   * Resolves optional insert-before sibling under a destination parent.
   *
   * @param model Destination solid model.
   * @param nodeIdBefore Brush id or group uuid.
   * @returns Sibling object or null.
   */
  private resolveInsertBefore(model: SolidModel, nodeIdBefore?: string): THREE.Object3D | null {
    if (!nodeIdBefore) return null;
    const nodes = resolveSolidHierarchyNodes(this.host.worldObject, [nodeIdBefore]);
    const node = nodes[0];
    if (!node || node.model !== model) return null;
    return node.node;
  }

  /**
   * Builds valid reparent moves for same-model solid tree edits.
   *
   * @param nodes Resolved source nodes.
   * @param destination Target parent and model.
   * @param insertBefore Optional sibling.
   * @returns Moves accepted by CommandObjectReparentObjects.
   */
  private buildReparentMoves(
    nodes: Array<{ model: SolidModel; node: THREE.Object3D }>,
    destination: { model: SolidModel; parent: THREE.Object3D },
    insertBefore: THREE.Object3D | null,
  ): Array<{ object: THREE.Object3D; newParent: THREE.Object3D; insertBefore: THREE.Object3D | null }> {
    const moves: Array<{ object: THREE.Object3D; newParent: THREE.Object3D; insertBefore: THREE.Object3D | null }> = [];
    for (const entry of nodes) {
      if (entry.model !== destination.model) continue;
      if (entry.node === destination.parent) continue;
      if (!isValidSolidTreeParent(entry.node, destination.parent, destination.model.root)) continue;
      if (this.wouldCreateCycle(entry.node, destination.parent)) continue;
      moves.push({ object: entry.node, newParent: destination.parent, insertBefore });
    }
    return moves;
  }

  /**
   * Returns true when parenting object under parent would create a cycle.
   *
   * @param object Node being moved.
   * @param parent Destination parent.
   * @returns True when parent is object or a descendant of object.
   */
  private wouldCreateCycle(object: THREE.Object3D, parent: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = parent;
    while (current) {
      if (current === object) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Maps a hierarchy object back to its MCP id (brush id or group uuid).
   *
   * @param object Scene object.
   * @param model Owning model.
   * @returns Id string.
   */
  private nodeIdForObject(object: THREE.Object3D, model: SolidModel): string {
    if (isSolidCsgGroup(object)) return object.uuid;
    if (object instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(object)) {
      return model.findBrushByMesh(object)?.id ?? object.uuid;
    }
    return object.uuid;
  }

  /**
   * Syncs evaluation order and partially rebuilds a solid after hierarchy
   * edits. Prefer seed brushes when available so only the branch and its
   * neighbors recompile.
   *
   * @param model Solid model.
   * @param seedRoots Optional hierarchy roots whose brushes seed partial CSG.
   */
  private rebuildModel(model: SolidModel, seedRoots: readonly THREE.Object3D[] = []): void {
    if (seedRoots.length > 0) {
      model.hierarchyMutationRefresh(hierarchySeedBrushIdsCollectUnderRoots(model, seedRoots));
      return;
    }
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
  }

  /**
   * Allocates a default group display name.
   *
   * @returns Name like Group1.
   */
  private nextGroupName(): string {
    this.groupCounter += 1;
    return `Group${this.groupCounter}`;
  }

  /**
   * Refreshes outliner and status after a mutation.
   *
   * @param message Status message.
   */
  private afterMutation(message: string): void {
    this.host.refreshAfterWorldMutation();
    this.host.refreshOutliner();
    this.host.showStatus(message);
  }
}

/**
 * Builds a failed tool result.
 *
 * @param message Error message.
 * @returns Tool result.
 */
function fail(message: string): McpToolResult {
  return { ok: false, message };
}
