import * as THREE from 'three';
import { collectMeshesUnder } from '@/utils/utils_hierarchy.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { EditorApiHost } from './editor_api_host.js';
import type {
  AddBoxBrushArgs,
  AddBoxBrushBatchEntry,
  AddBoxBrushesArgs,
  BatchSetBrushTransformArgs,
  ClipBrushArgs,
  DuplicateBrushesArgs,
  MirrorBrushesArgs,
  RenameBrushArgs,
  ReorderBrushRelativeArgs,
  ReorderBrushesArgs,
  RotateBrushArgs,
  SetBrushTransformArgs,
  SplitBrushArgs,
} from './editor_api_types.js';
import { dtoToVec3 } from './editor_api_math.js';
import {
  findBrush,
  findCsgGroup,
  findSolidModel,
  resolveBrushMeshes,
  resolveSolidHierarchyNodes,
} from './editor_api_lookup.js';
import { nameToSolidOperation, parseOperationOrAdditive } from './editor_api_operations.js';
import {
  isEditorApiSnapActive,
  meshTransformSummary,
  resolveEulerFromArgs,
  resolveSnappedPosition,
  resolveSnappedScale,
  shouldApplySnap,
  snapEulerWhenRequested,
} from './editor_api_snap.js';
import { buildWorldClipPlane, planeArgsHelpMessage } from './editor_api_plane.js';
import { EditorApiCommandAddBox } from './editor_api_command_box_add.js';
import { EditorApiCommandRenameBrush } from './editor_api_command_rename.js';
import { buildRelativeBrushOrder, EditorApiCommandReorderBrushList } from './editor_api_command_reorder.js';
import { CommandSolidModelCreate } from '@/solid/commands/model/command_solid_model_create.js';
import { CommandSolidBrushClip } from '@/solid/commands/brush/command_solid_brush_clip.js';
import { CommandSolidBrushesDelete } from '@/solid/commands/brushes/command_solid_brushes_delete.js';
import { CommandHierarchyDuplicate } from '@/outliner/commands/command_hierarchy_duplicate.js';
import { CommandSolidBrushesReorder } from '@/solid/commands/brushes/command_solid_brushes_reorder.js';
import { CommandSolidBrushOperationSet } from '@/solid/commands/brush/command_solid_brush_operation_set.js';
import { CommandSolidBrushSplit } from '@/solid/commands/brush/command_solid_brush_split.js';
import { CommandTransformPositionSet } from '@/transform/commands/command_transform_position_set.js';
import { CommandTransformRotationSet } from '@/transform/commands/command_transform_rotation_set.js';
import { CommandTransformScaleSet } from '@/transform/commands/command_transform_scale_set.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE } from '@/solid/model/solid_model_startup_default.js';
import { assignSnapExact } from './editor_api_optional.js';
import type { McpToolResult, McpVec3 } from '@/ai/shared/mcp_protocol_types.js';

/** Mutation helpers for solid models via existing undo commands. */
export class EditorApiSolidWrites {
  private readonly host: EditorApiHost;

  /**
   * Creates solid write helpers.
   *
   * @param host Injected editor systems.
   */
  constructor(host: EditorApiHost) {
    this.host = host;
  }

  /**
   * Creates a new solid model with one additive box brush.
   *
   * @param name Optional model display name.
   * @returns Tool result with created model and brush ids.
   */
  createSolidModel(name?: string): McpToolResult {
    const model = new SolidModel(name?.trim() || undefined);
    const brush = model.addBoxBrush(SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE, SolidOperation.Additive);
    this.host.commandStack.push(new CommandSolidModelCreate(model, this.host.worldObject));
    this.selectBrushMesh(brush.mesh);
    this.afterMutation(`Created ${model.root.name}`);
    return {
      ok: true,
      message: `Created solid model ${model.root.name}`,
      createdIds: [model.root.uuid, brush.id],
      data: { modelId: model.root.uuid, brushId: brush.id },
    };
  }

  /**
   * Adds a box brush under a solid model.
   *
   * @param args Add-box arguments.
   * @returns Tool result with created brush id.
   */
  addBoxBrush(args: AddBoxBrushArgs): McpToolResult {
    const model = findSolidModel(this.host.worldObject, args.modelId);
    if (!model) return fail(`Solid model not found: ${args.modelId}`);
    if (args.parentGroupId) {
      const parent = this.resolveAddBrushParent(model, args.parentGroupId);
      if (!parent) return fail(`CSG group not found under model: ${args.parentGroupId}`);
    }
    const brush = this.createBoxBrushOnModel(model, args);
    this.selectBrushMesh(brush?.mesh ?? null);
    this.afterMutation(`Added ${brush?.name ?? 'brush'}`);
    return {
      ok: true,
      message: `Added brush ${brush?.name ?? ''}`,
      createdIds: brush ? [brush.id] : [],
      data: {
        brushId: brush?.id ?? null,
        name: brush?.name ?? null,
        modelId: model.root.uuid,
        parentGroupId: args.parentGroupId ?? null,
        transform: brush?.mesh ? meshTransformSummary(brush.mesh) : null,
      },
    };
  }

  /**
   * Adds many box brushes in one call (same model).
   *
   * @param args Batch create arguments.
   * @returns Created brush ids.
   */
  addBoxBrushes(args: AddBoxBrushesArgs): McpToolResult {
    if (!Array.isArray(args.brushes) || args.brushes.length === 0) {
      return fail('brushes must be a non-empty array');
    }
    const createdIds: string[] = [];
    const entries: Array<{ brushId: string; name: string }> = [];
    for (const entry of args.brushes) {
      const boxArgs: AddBoxBrushArgs = { modelId: args.modelId, ...entry };
      assignSnapExact(boxArgs, args);
      const result = this.addBoxBrush(boxArgs);
      if (!result.ok) return result;
      this.collectCreatedBrushEntry(result, createdIds, entries);
      const brushId = (result.data as { brushId?: string } | undefined)?.brushId;
      if (brushId) this.applyBatchInsertHint(brushId, entry);
    }
    return {
      ok: true,
      message: `Added ${createdIds.length} brush(es)`,
      createdIds,
      data: { brushes: entries, count: createdIds.length },
    };
  }

  /**
   * Creates one box brush on a model with optional rename.
   *
   * @param model Target solid model.
   * @param args Add-box arguments.
   * @returns Created brush or null.
   */
  private createBoxBrushOnModel(model: SolidModel, args: AddBoxBrushArgs) {
    const useSnap = shouldApplySnap(args);
    const position = resolveSnappedPosition(this.host, args.position, new THREE.Vector3(), useSnap);
    const rotation = snapEulerWhenRequested(
      this.host,
      resolveEulerFromArgs(args.rotationDegrees, args.rotation),
      useSnap,
    );
    const scale = resolveSnappedScale(this.host, args.scale, new THREE.Vector3(1, 1, 1), useSnap);
    const parent = this.resolveAddBrushParent(model, args.parentGroupId);
    const command = new EditorApiCommandAddBox(
      model,
      resolveBoxSize(args.size),
      parseOperationOrAdditive(args.operation),
      position,
      rotation,
      scale,
      parent,
    );
    this.host.commandStack.push(command);
    const brush = command.getCreatedBrush();
    if (brush && args.name?.trim()) {
      this.host.commandStack.push(new EditorApiCommandRenameBrush(model, brush.id, args.name.trim()));
    }
    return brush;
  }

  /**
   * Resolves an optional solid CSG group parent for a new brush.
   *
   * @param model Target solid model.
   * @param parentGroupId Optional group uuid.
   * @returns Parent group, solid root when omitted, or null when invalid.
   */
  private resolveAddBrushParent(model: SolidModel, parentGroupId?: string): THREE.Object3D | null {
    if (!parentGroupId) return null;
    const found = findCsgGroup(this.host.worldObject, parentGroupId);
    if (!found || found.model !== model) return null;
    return found.group;
  }

  /**
   * Collects created brush id/name from an add result into batch accumulators.
   *
   * @param result Tool result from add_box_brush.
   * @param createdIds Accumulator for ids.
   * @param entries Accumulator for id/name rows.
   */
  private collectCreatedBrushEntry(
    result: McpToolResult,
    createdIds: string[],
    entries: Array<{ brushId: string; name: string }>,
  ): void {
    const data = result.data as { brushId?: string; name?: string } | undefined;
    if (!data?.brushId) return;
    createdIds.push(data.brushId);
    entries.push({ brushId: data.brushId, name: data.name ?? '' });
  }

  /**
   * Applies optional insertAfter/Before hints after a batch entry is created.
   *
   * @param brushId Newly created brush id.
   * @param entry Batch entry with optional insert hints.
   */
  private applyBatchInsertHint(brushId: string, entry: AddBoxBrushBatchEntry): void {
    const placement = entry.insertBeforeName || entry.insertBeforeBrushId ? 'before' : 'after';
    const relativeToName = entry.insertBeforeName ?? entry.insertAfterName;
    const relativeToBrushId = entry.insertBeforeBrushId ?? entry.insertAfterBrushId;
    if (!relativeToName && !relativeToBrushId) return;
    const reorderArgs: ReorderBrushRelativeArgs = { brushId, placement };
    if (relativeToName !== undefined) reorderArgs.relativeToName = relativeToName;
    if (relativeToBrushId !== undefined) reorderArgs.relativeToBrushId = relativeToBrushId;
    this.reorderBrushRelative(reorderArgs);
  }

  /**
   * Resolves a relative brush id from name or id on the same model.
   *
   * @param model Owning model.
   * @param args Relative reorder args.
   * @returns Brush id or null.
   */
  private resolveRelativeBrushId(model: SolidModel, args: ReorderBrushRelativeArgs): string | null {
    if (args.relativeToBrushId) {
      return model.findBrush(args.relativeToBrushId) ? args.relativeToBrushId : null;
    }
    if (!args.relativeToName?.trim()) return null;
    const needle = args.relativeToName.trim().toLowerCase();
    const match = model.getBrushes().find((brush) => brush.name.toLowerCase() === needle);
    return match?.id ?? null;
  }

  /**
   * Sets CSG operations on brushes.
   *
   * @param brushIds Brush ids.
   * @param operationName MCP operation name.
   * @returns Tool result.
   */
  setBrushOperation(brushIds: string[], operationName: string): McpToolResult {
    const operation = nameToSolidOperation(operationName);
    if (operation === null) return fail(`Invalid operation: ${operationName}`);
    const meshes = resolveBrushMeshes(this.host.worldObject, brushIds);
    if (meshes.length === 0) return fail('No matching brushes found');
    this.host.commandStack.push(new CommandSolidBrushOperationSet(meshes, operation));
    this.afterMutation('Updated brush operation');
    return { ok: true, message: `Set operation to ${operationName}`, data: { count: meshes.length } };
  }

  /**
   * Sets brush transform fields (snapped when snap is on) and rebuilds CSG.
   * Pass snap:false or exact:true to place values precisely without grid snap.
   *
   * @param args Partial TRS for one brush.
   * @returns Tool result with applied transform (rotation in degrees).
   */
  setBrushTransform(args: SetBrushTransformArgs): McpToolResult {
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found?.brush.mesh) return fail(`Brush not found: ${args.brushId}`);
    const mesh = found.brush.mesh;
    this.applyTransformCommands(mesh, args, shouldApplySnap(args));
    found.brush.pullTransformFromMesh();
    this.host.solidModelController.onTransformsCommitted([mesh]);
    this.afterMutation(`Transformed ${found.brush.name}`);
    return {
      ok: true,
      message: `Updated transform for ${found.brush.name}`,
      data: { brushId: args.brushId, transform: meshTransformSummary(mesh) },
    };
  }

  /**
   * Applies several brush transforms in one tool call.
   *
   * @param args Batch transform arguments.
   * @returns Per-brush results summary.
   */
  batchSetBrushTransform(args: BatchSetBrushTransformArgs): McpToolResult {
    if (!Array.isArray(args.transforms) || args.transforms.length === 0) {
      return fail('transforms must be a non-empty array');
    }
    const updated: string[] = [];
    for (const entry of args.transforms) {
      const transformArgs: SetBrushTransformArgs = { brushId: entry.brushId };
      if (entry.position !== undefined) transformArgs.position = entry.position;
      if (entry.rotationDegrees !== undefined) transformArgs.rotationDegrees = entry.rotationDegrees;
      if (entry.rotation !== undefined) transformArgs.rotation = entry.rotation;
      if (entry.scale !== undefined) transformArgs.scale = entry.scale;
      const snap = entry.snap ?? args.snap;
      const exact = entry.exact ?? args.exact;
      if (snap !== undefined) transformArgs.snap = snap;
      if (exact !== undefined) transformArgs.exact = exact;
      const result = this.setBrushTransform(transformArgs);
      if (!result.ok) return result;
      updated.push(entry.brushId);
    }
    return {
      ok: true,
      message: `Updated ${updated.length} transform(s)`,
      data: { brushIds: updated, count: updated.length },
    };
  }

  /**
   * Renames a brush for stable AI-friendly lookup (undoable).
   *
   * @param args Rename arguments.
   * @returns Tool result.
   */
  renameBrush(args: RenameBrushArgs): McpToolResult {
    const name = args.name?.trim();
    if (!name) return fail('name must be a non-empty string');
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found) return fail(`Brush not found: ${args.brushId}`);
    this.host.commandStack.push(new EditorApiCommandRenameBrush(found.model, args.brushId, name));
    this.afterMutation(`Renamed to ${name}`);
    return { ok: true, message: `Renamed to ${name}`, data: { brushId: args.brushId, name } };
  }

  /**
   * Rotates a brush around one axis by degrees (relative by default). Uses
   * rotation snap when the editor snap is enabled.
   *
   * @param args Rotate-brush arguments.
   * @returns Tool result with applied rotation in degrees.
   */
  rotateBrush(args: RotateBrushArgs): McpToolResult {
    if (typeof args.degrees !== 'number' || !Number.isFinite(args.degrees)) {
      return fail('degrees must be a finite number');
    }
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found?.brush.mesh) return fail(`Brush not found: ${args.brushId}`);
    const mesh = found.brush.mesh;
    const axis = args.axis ?? 'y';
    const previousDegrees = THREE.MathUtils.radToDeg(this.readAxisAngle(mesh.rotation, axis));
    const nextRotation = mesh.rotation.clone();
    const radians = THREE.MathUtils.degToRad(args.degrees);
    if (args.absolute) this.setAxisAngle(nextRotation, axis, radians);
    else this.addAxisAngle(nextRotation, axis, radians);
    if (shouldApplySnap(args)) this.snapAxisAngleIfEnabled(nextRotation, axis);
    this.host.commandStack.push(new CommandTransformRotationSet([mesh], [nextRotation]));
    found.brush.pullTransformFromMesh();
    this.host.solidModelController.onTransformsCommitted([mesh]);
    this.afterMutation(`Rotated ${found.brush.name}`);
    const finalDegrees = THREE.MathUtils.radToDeg(this.readAxisAngle(mesh.rotation, axis));
    return {
      ok: true,
      message: `Rotated ${found.brush.name} around ${axis}`,
      data: {
        brushId: args.brushId,
        axis,
        degreesRequested: args.degrees,
        degreesBefore: previousDegrees,
        degreesAfter: finalDegrees,
        absolute: Boolean(args.absolute),
        transform: meshTransformSummary(mesh),
      },
    };
  }

  /**
   * Clips a brush by a world plane, keeping one half-space (undoable).
   *
   * @param args Clip arguments including plane definition.
   * @returns Tool result.
   */
  clipBrush(args: ClipBrushArgs): McpToolResult {
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found?.brush.mesh) return fail(`Brush not found: ${args.brushId}`);
    const plane = buildWorldClipPlane(args);
    if (!plane) return fail(planeArgsHelpMessage());
    const keepFront = args.keepFront !== false;
    const command = new CommandSolidBrushClip(found.model, args.brushId, plane, keepFront);
    command.execute();
    if (!command.didClip()) {
      return fail('Clip failed (plane may miss the brush or empty keep side)');
    }
    this.host.commandStack.recordExecuted(command);
    this.selectBrushMesh(found.model.findBrush(args.brushId)?.mesh ?? null);
    this.afterMutation(`Clipped ${found.brush.name}`);
    const updated = found.model.findBrush(args.brushId);
    return {
      ok: true,
      message: `Clipped ${found.brush.name}`,
      data: {
        brushId: args.brushId,
        keepFront,
        transform: updated?.mesh ? meshTransformSummary(updated.mesh) : null,
      },
    };
  }

  /**
   * Splits a brush into two pieces by a world plane (undoable).
   *
   * @param args Split arguments including plane definition.
   * @returns Tool result with created brush ids.
   */
  splitBrush(args: SplitBrushArgs): McpToolResult {
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found?.brush.mesh) return fail(`Brush not found: ${args.brushId}`);
    const plane = buildWorldClipPlane(args);
    if (!plane) return fail(planeArgsHelpMessage());
    const command = new CommandSolidBrushSplit(found.model, args.brushId, plane);
    command.execute();
    if (!command.didSplit()) {
      return fail('Split failed (plane may miss the brush)');
    }
    this.host.commandStack.recordExecuted(command);
    const resultMeshes = command.getResultMeshes();
    const createdIds = resultMeshes
      .map((mesh) => found.model.findBrushByMesh(mesh)?.id)
      .filter((id): id is string => !!id);
    if (resultMeshes[0]) this.host.selectionManager.selectObject(resultMeshes[0]);
    this.afterMutation(`Split ${found.brush.name}`);
    return {
      ok: true,
      message: `Split into ${createdIds.length} brush(es)`,
      createdIds,
      data: { sourceBrushId: args.brushId, brushIds: createdIds },
    };
  }

  /**
   * Deletes brushes by id.
   *
   * @param brushIds Brush ids.
   * @returns Tool result.
   */
  deleteBrushes(brushIds: string[]): McpToolResult {
    const meshes = resolveBrushMeshes(this.host.worldObject, brushIds);
    if (meshes.length === 0) return fail('No matching brushes found');
    this.host.commandStack.push(new CommandSolidBrushesDelete(meshes));
    this.host.selectionManager.clearSelection();
    this.afterMutation(`Deleted ${meshes.length} brush(es)`);
    return { ok: true, message: `Deleted ${meshes.length} brush(es)`, data: { count: meshes.length } };
  }

  /**
   * Duplicates brushes and/or solid CSG groups with optional local offset and
   * optional mirror across X/Z. Pass groupIds to clone nested compounds.
   *
   * @param args Duplicate arguments.
   * @returns Tool result with created brush ids and group ids.
   */
  duplicateBrushes(args: DuplicateBrushesArgs): McpToolResult {
    const nodeIds = [...(args.brushIds ?? []), ...(args.groupIds ?? [])];
    const nodes = resolveSolidHierarchyNodes(this.host.worldObject, nodeIds).map((entry) => entry.node);
    if (nodes.length === 0) return fail('No matching brushes or CSG groups found');
    const offsetVector = dtoToVec3(args.offset, new THREE.Vector3(1, 0, 0));
    const command = new CommandHierarchyDuplicate(nodes, offsetVector);
    this.host.commandStack.push(command);
    const roots = command.getClones();
    const clones = roots
      .flatMap((root) => collectMeshesUnder(root))
      .filter((mesh) => SolidBrushVisual.isBrushObject(mesh));
    const createdBrushIds = clones
      .map((mesh) => SolidModel.fromObject(mesh)?.findBrushByMesh(mesh)?.id)
      .filter((id): id is string => !!id);
    const createdGroupIds = roots.filter((root) => !(root instanceof THREE.Mesh)).map((root) => root.uuid);
    if (args.mirrorAxis) {
      this.mirrorBrushIds(createdBrushIds, args.mirrorAxis, args.mirrorPlane ?? 0, shouldApplySnap(args));
    }
    if (roots[0] instanceof THREE.Mesh) this.host.selectionManager.selectObject(roots[0]);
    else if (clones[0]) this.host.selectionManager.selectObject(clones[0]);
    this.afterMutation(`Duplicated ${nodes.length} hierarchy node(s)`);
    return {
      ok: true,
      message:
        `Duplicated ${createdBrushIds.length} brush(es)` +
        (createdGroupIds.length > 0 ? ` in ${createdGroupIds.length} group(s)` : ''),
      // Brush ids only so callers (e.g. mirror) can chain without group uuids.
      createdIds: createdBrushIds,
      data: {
        count: createdBrushIds.length,
        brushIds: createdBrushIds,
        groupIds: createdGroupIds,
      },
    };
  }

  /**
   * Mirrors brushes across a world X or Z plane (copy by default).
   *
   * @param args Mirror arguments.
   * @returns Tool result with affected brush ids.
   */
  mirrorBrushes(args: MirrorBrushesArgs): McpToolResult {
    if (args.axis !== 'x' && args.axis !== 'z') return fail('axis must be "x" or "z"');
    const copy = args.copy !== false;
    const plane = typeof args.plane === 'number' ? args.plane : 0;
    const useSnap = shouldApplySnap(args);
    let targetIds = args.brushIds;
    if (copy) {
      const duplicated = this.duplicateBrushes({
        brushIds: args.brushIds,
        offset: { x: 0, y: 0, z: 0 },
        snap: false,
      });
      if (!duplicated.ok) return duplicated;
      const data = duplicated.data as { brushIds?: string[] } | undefined;
      targetIds = data?.brushIds ?? duplicated.createdIds ?? [];
    }
    this.mirrorBrushIds(targetIds, args.axis, plane, useSnap);
    this.afterMutation(`Mirrored ${targetIds.length} brush(es)`);
    const result: McpToolResult = {
      ok: true,
      message: `Mirrored ${targetIds.length} brush(es) across ${args.axis}=${plane}`,
      data: { brushIds: targetIds, axis: args.axis, plane, copy },
    };
    if (copy) result.createdIds = targetIds;
    return result;
  }

  /**
   * Moves brushes and/or solid CSG groups to first or last among siblings.
   *
   * @param args Reorder arguments.
   * @returns Tool result.
   */
  reorderBrushes(args: ReorderBrushesArgs): McpToolResult {
    const nodeIds = [...(args.brushIds ?? []), ...(args.groupIds ?? [])];
    const nodes = resolveSolidHierarchyNodes(this.host.worldObject, nodeIds).map((entry) => entry.node);
    if (nodes.length === 0) return fail('No matching brushes or CSG groups found');
    this.host.commandStack.push(new CommandSolidBrushesReorder(nodes, args.end));
    this.afterMutation(`Moved hierarchy nodes to ${args.end}`);
    return {
      ok: true,
      message: `Moved ${nodes.length} node(s) to ${args.end}`,
      data: { count: nodes.length, end: args.end },
    };
  }

  /**
   * Moves one brush before or after another brush (by id or name).
   *
   * @param args Relative reorder arguments.
   * @returns Tool result with new order indices.
   */
  reorderBrushRelative(args: ReorderBrushRelativeArgs): McpToolResult {
    if (args.placement !== 'before' && args.placement !== 'after') {
      return fail('placement must be "before" or "after"');
    }
    const found = findBrush(this.host.worldObject, args.brushId);
    if (!found) return fail(`Brush not found: ${args.brushId}`);
    const relativeId = this.resolveRelativeBrushId(found.model, args);
    if (!relativeId) return fail('Provide relativeToBrushId or relativeToName matching a brush');
    const orderedIds = found.model.getBrushes().map((brush) => brush.id);
    const nextOrder = buildRelativeBrushOrder(orderedIds, args.brushId, relativeId, args.placement);
    if (!nextOrder) return fail('Could not compute relative order (missing brush or same id)');
    this.host.commandStack.push(new EditorApiCommandReorderBrushList(found.model, nextOrder));
    this.afterMutation(`Reordered ${found.brush.name} ${args.placement} relative brush`);
    const orderIndex = nextOrder.indexOf(args.brushId);
    return {
      ok: true,
      message: `Moved brush ${args.placement} relative target`,
      data: { brushId: args.brushId, relativeToBrushId: relativeId, placement: args.placement, orderIndex },
    };
  }

  /**
   * Sets inverted-world mode on a solid model.
   *
   * @param modelId Solid model root uuid.
   * @param inverted Whether inverted world is enabled.
   * @returns Tool result.
   */
  setInvertedWorld(modelId: string, inverted: boolean): McpToolResult {
    const model = findSolidModel(this.host.worldObject, modelId);
    if (!model) return fail(`Solid model not found: ${modelId}`);
    model.setInvertedWorld(inverted);
    this.afterMutation(inverted ? 'Inverted world enabled' : 'Inverted world disabled');
    return { ok: true, message: inverted ? 'Inverted world enabled' : 'Inverted world disabled' };
  }

  /**
   * Selects brushes by id (first mesh becomes the selection).
   *
   * @param brushIds Brush ids.
   * @returns Tool result.
   */
  selectBrushes(brushIds: string[]): McpToolResult {
    const meshes = resolveBrushMeshes(this.host.worldObject, brushIds);
    if (meshes.length === 0) {
      this.host.selectionManager.clearSelection();
      return { ok: true, message: 'Selection cleared (no matching brushes)', data: { count: 0 } };
    }
    this.host.selectionManager.setSelection(meshes);
    this.host.refreshOutliner();
    return { ok: true, message: `Selected ${meshes.length} brush(es)`, data: { count: meshes.length } };
  }

  /**
   * Undoes the last command and refreshes solid models.
   *
   * @returns Tool result.
   */
  undo(): McpToolResult {
    if (!this.host.commandStack.canUndo()) return fail('Nothing to undo');
    this.host.commandStack.undo();
    this.refreshAfterHistory();
    return { ok: true, message: 'Undo' };
  }

  /**
   * Redoes the last undone command and refreshes solid models.
   *
   * @returns Tool result.
   */
  redo(): McpToolResult {
    if (!this.host.commandStack.canRedo()) return fail('Nothing to redo');
    this.host.commandStack.redo();
    this.refreshAfterHistory();
    return { ok: true, message: 'Redo' };
  }

  /**
   * Applies position/rotation/scale commands for fields present in args.
   *
   * @param mesh Brush preview mesh.
   * @param args Partial transform fields.
   * @param useSnap Whether editor snap should apply.
   */
  private applyTransformCommands(mesh: THREE.Mesh, args: SetBrushTransformArgs, useSnap: boolean): void {
    if (args.position) {
      const position = resolveSnappedPosition(this.host, args.position, mesh.position, useSnap);
      this.host.commandStack.push(new CommandTransformPositionSet([mesh], [position]));
    }
    if (args.rotationDegrees || args.rotation) {
      const rotation = snapEulerWhenRequested(
        this.host,
        resolveEulerFromArgs(args.rotationDegrees, args.rotation),
        useSnap,
      );
      this.host.commandStack.push(new CommandTransformRotationSet([mesh], [rotation]));
    }
    if (args.scale) {
      const scale = resolveSnappedScale(this.host, args.scale, mesh.scale, useSnap);
      this.host.commandStack.push(new CommandTransformScaleSet([mesh], [scale]));
    }
  }

  /**
   * Mirrors brush local positions (and yaw) across a constant X or Z plane.
   *
   * @param brushIds Brush ids to mirror in place.
   * @param axis Mirror axis.
   * @param plane Plane coordinate on that axis.
   * @param useSnap Whether to snap resulting positions.
   */
  private mirrorBrushIds(brushIds: string[], axis: 'x' | 'z', plane: number, useSnap: boolean): void {
    for (const brushId of brushIds) {
      const found = findBrush(this.host.worldObject, brushId);
      if (!found?.brush.mesh) continue;
      this.mirrorOneBrush(found.brush.mesh, found, axis, plane, useSnap);
    }
  }

  /**
   * Mirrors one brush mesh across a plane.
   *
   * @param mesh Brush mesh.
   * @param found Brush lookup for rebuild.
   * @param axis Mirror axis.
   * @param plane Plane coordinate.
   * @param useSnap Snap flag.
   */
  private mirrorOneBrush(
    mesh: THREE.Mesh,
    found: { brush: { pullTransformFromMesh: () => void } },
    axis: 'x' | 'z',
    plane: number,
    useSnap: boolean,
  ): void {
    const nextPosition = mesh.position.clone();
    if (axis === 'x') nextPosition.x = plane * 2 - nextPosition.x;
    else nextPosition.z = plane * 2 - nextPosition.z;
    if (useSnap && isEditorApiSnapActive(this.host)) {
      this.host.gridSnap.snapWorldPosition(nextPosition);
    }
    const nextRotation = mesh.rotation.clone();
    // Reflect yaw: X-mirror → -yaw; Z-mirror → π - yaw (not -yaw).
    nextRotation.y = axis === 'x' ? -nextRotation.y : Math.PI - nextRotation.y;
    this.host.commandStack.push(new CommandTransformPositionSet([mesh], [nextPosition]));
    this.host.commandStack.push(new CommandTransformRotationSet([mesh], [nextRotation]));
    found.brush.pullTransformFromMesh();
    this.host.solidModelController.onTransformsCommitted([mesh]);
  }

  /**
   * Adds an angle to one Euler axis.
   *
   * @param rotation Euler to mutate.
   * @param axis Axis name.
   * @param radians Angle delta in radians.
   */
  private addAxisAngle(rotation: THREE.Euler, axis: 'x' | 'y' | 'z', radians: number): void {
    this.setAxisAngle(rotation, axis, this.readAxisAngle(rotation, axis) + radians);
  }

  /**
   * Sets an absolute angle on one Euler axis.
   *
   * @param rotation Euler to mutate.
   * @param axis Axis name.
   * @param radians Absolute angle in radians.
   */
  private setAxisAngle(rotation: THREE.Euler, axis: 'x' | 'y' | 'z', radians: number): void {
    if (axis === 'x') rotation.x = radians;
    else if (axis === 'y') rotation.y = radians;
    else rotation.z = radians;
  }

  /**
   * Reads one Euler axis angle in radians.
   *
   * @param rotation Euler rotation.
   * @param axis Axis name.
   * @returns Angle in radians.
   */
  private readAxisAngle(rotation: THREE.Euler, axis: 'x' | 'y' | 'z'): number {
    if (axis === 'x') return rotation.x;
    if (axis === 'y') return rotation.y;
    return rotation.z;
  }

  /**
   * Snaps a single Euler axis when snap is active.
   *
   * @param rotation Euler to mutate.
   * @param axis Axis name.
   */
  private snapAxisAngleIfEnabled(rotation: THREE.Euler, axis: 'x' | 'y' | 'z'): void {
    if (!isEditorApiSnapActive(this.host)) return;
    const snapped = this.host.gridSnap.snapAngleRadians(this.readAxisAngle(rotation, axis));
    this.setAxisAngle(rotation, axis, snapped);
  }

  /**
   * Selects a brush mesh when present.
   *
   * @param mesh Brush mesh or null.
   */
  private selectBrushMesh(mesh: THREE.Mesh | null): void {
    if (mesh) this.host.selectionManager.selectObject(mesh);
  }

  /** Refreshes viewports and outliner after a world mutation. */
  private afterMutation(status: string): void {
    this.host.refreshAfterWorldMutation();
    this.host.refreshOutliner();
    this.host.showStatus(status);
  }

  /** Refreshes solids and UI after undo/redo. */
  private refreshAfterHistory(): void {
    this.host.selectionManager.pruneSelectionNotInScene(this.host.worldObject);
    SolidModel.refreshAfterHistoryChange(this.host.worldObject);
    this.afterMutation('History changed');
  }
}

/**
 * Resolves box size from a number or vec3 DTO.
 *
 * @param size Size argument.
 * @returns Size vector.
 */
function resolveBoxSize(size: number | McpVec3 | undefined): THREE.Vector3 {
  if (typeof size === 'number') return new THREE.Vector3(size, size, size);
  if (size) return new THREE.Vector3(size.x, size.y, size.z);
  return new THREE.Vector3(
    SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE,
    SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE,
    SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE,
  );
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
