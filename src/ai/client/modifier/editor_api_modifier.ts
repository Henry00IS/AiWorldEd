import * as THREE from 'three';
import type { McpToolResult, McpVec3 } from '@/ai/shared/mcp_protocol_types.js';
import { CommandModifierVolumeBake } from '@/modifier/stack/bake/command_modifier_volume_bake.js';
import { CommandModifierStackSet } from '@/modifier/stack/command_modifier_stack_set.js';
import { CommandModifierVolumeCreate } from '@/modifier/stack/command_modifier_volume_create.js';
import { modifierStackKindFind, modifierStackKinds } from '@/modifier/stack/modifier_stack_catalog.js';
import {
  MODIFIER_GENERATOR_NODE_KINDS,
  modifierGeneratorNodeCreate,
} from '@/modifier/stack/modifier_generator_node.js';
import {
  modifierStackAdd,
  modifierStackDuplicate,
  modifierStackMove,
  modifierStackPatch,
  modifierStackRemove,
} from '@/modifier/stack/modifier_stack_operations.js';
import { modifierStackPresetApply } from '@/modifier/stack/modifier_stack_presets.js';
import { MODIFIER_STACK_MAX_MODIFIERS } from '@/modifier/stack/modifier_stack_settings.js';
import type {
  ModifierStackEntry,
  ModifierStackField,
  ModifierStackSettings,
} from '@/modifier/stack/modifier_stack_types.js';
import { ModifierVolume } from '@/modifier/stack/modifier_volume.js';
import { modifierVolumeTemplateCreate, modifierVolumeTemplates } from '@/modifier/stack/modifier_volume_templates.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import type { EditorApiHost } from '@/ai/client/editor_api_host.js';
import { findCsgGroup, findSolidModel } from '@/ai/client/editor_api_lookup.js';
import { dtoToVec3 } from '@/ai/client/editor_api_math.js';
import { failResult, okResult } from '@/ai/client/editor_api_result.js';
import { meshTransformSummary, resolveEulerFromArgs } from '@/ai/client/editor_api_snap.js';
import { modifierKindDescribe, modifierVolumeTemplatesDescribe } from './editor_api_modifier_describe.js';
import {
  modifierHolderFind,
  modifierHoldersList,
  modifierObjectFind,
  type ModifierHolder,
} from './editor_api_modifier_lookup.js';
import { modifierParametersPatch, modifierParametersRead } from './editor_api_modifier_values.js';

/** Placement of a new modifier volume or generator node. */
export interface ModifierPlacementArgs {
  position?: McpVec3;
  size?: McpVec3;
  rotationDegrees?: McpVec3;
  name?: string;
}

/**
 * Reads and edits modifier stacks through the inspector's pure stack operations
 * and its undoable commands, so every change syncs in multiplayer.
 */
export class EditorApiModifier {
  /** Notes collected while the current edit validated its values. */
  private warnings: string[] = [];
  /** Last status line of each pressed modifier button, by holder/modifier/key. */
  private readonly actionStatuses = new Map<string, string>();

  /**
   * Creates the modifier part.
   *
   * @param host Injected editor systems.
   */
  constructor(private readonly host: EditorApiHost) {}

  /**
   * Lists modifier kinds, derived from the installed kind catalog.
   *
   * @param kindId Optional kind to describe with every parameter.
   * @returns Kinds and volume templates.
   */
  kindList(kindId?: string): McpToolResult {
    if (kindId && !modifierStackKindFind(kindId))
      return failResult(
        `Unknown modifier kind ${kindId}. Kinds: ${modifierStackKinds.map((kind) => kind.id).join(', ')}`,
      );
    const kinds = modifierStackKinds.filter((kind) => !kindId || kind.id === kindId);
    return okResult(`${kinds.length} modifier kind(s)`, {
      kinds: kinds.map((kind) => modifierKindDescribe(kind, Boolean(kindId))),
      volumeTemplates: modifierVolumeTemplatesDescribe(),
      maxModifiers: MODIFIER_STACK_MAX_MODIFIERS,
    });
  }

  /**
   * Lists every object that carries modifiers.
   *
   * @returns Holder summaries.
   */
  holderList(): McpToolResult {
    const holders = modifierHoldersList(this.host.worldObject).map((holder) => this.holderSummary(holder, false));
    return okResult(`${holders.length} modifier holder(s)`, { holders });
  }

  /**
   * Returns one stack with normalized parameters.
   *
   * @param objectId Volume, generator, brush or group.
   * @returns Stack description.
   */
  stackGet(objectId: string): McpToolResult {
    const holder = modifierHolderFind(this.host.worldObject, objectId);
    if (typeof holder === 'string') return failResult(holder);
    return okResult(`Stack of ${holder.object.name}`, this.holderSummary(holder, true));
  }

  /**
   * Creates a modifier volume from an Add menu template.
   *
   * @param templateId Template id.
   * @param placement Pose and size.
   * @returns Created volume.
   */
  volumeCreate(templateId: string, placement: ModifierPlacementArgs): McpToolResult {
    if (!modifierVolumeTemplates.some((template) => template.id === templateId))
      return failResult(
        `Unknown template ${templateId}. Templates: ${modifierVolumeTemplates.map((template) => template.id).join(', ')}`,
      );
    const mesh = modifierVolumeTemplateCreate(templateId);
    this.placementApply(mesh, placement, this.host.worldObject);
    this.host.commandStack.push(new CommandModifierVolumeCreate(mesh, this.host.worldObject));
    return this.createdResult(mesh);
  }

  /**
   * Creates a generator node of any kind in MODIFIER_GENERATOR_NODE_KINDS
   * inside a solid model.
   *
   * @param kind Generator kind.
   * @param modelId Solid model.
   * @param parentGroupId Optional CSG group parent.
   * @param placement World pose and box size.
   * @returns Created node.
   */
  generatorCreate(
    kind: string,
    modelId: string,
    parentGroupId: string | undefined,
    placement: ModifierPlacementArgs,
  ): McpToolResult {
    if (!MODIFIER_GENERATOR_NODE_KINDS.includes(kind))
      return failResult(`kind must be one of ${MODIFIER_GENERATOR_NODE_KINDS.join(', ')}`);
    const model = findSolidModel(this.host.worldObject, modelId);
    if (!model) return failResult(`Solid model not found: ${modelId}`);
    const group = parentGroupId ? findCsgGroup(this.host.worldObject, parentGroupId) : null;
    if (parentGroupId && group?.model !== model) return failResult(`CSG group not found under model: ${parentGroupId}`);
    const parent = group?.group ?? model.root;
    const node = modifierGeneratorNodeCreate(kind);
    this.placementApply(node, placement, parent);
    this.host.commandStack.push(new CommandModifierVolumeCreate(node, parent));
    return this.createdResult(node);
  }

  /**
   * Adds a modifier, optionally with parameters, as one undo step.
   *
   * @param objectId Holder.
   * @param kind Kind id.
   * @param parameters Optional parameter values.
   * @param index Optional stack position.
   * @returns Updated stack.
   */
  entryAdd(
    objectId: string,
    kind: string,
    parameters: Record<string, unknown> | undefined,
    index: number | undefined,
  ): McpToolResult {
    return this.stackEdit(objectId, (stack, holder) => {
      const found = modifierStackKindFind(kind);
      if (!found)
        throw new Error(
          `Unknown modifier kind ${kind}. Kinds: ${modifierStackKinds.map((entry) => entry.id).join(', ')}`,
        );
      if (MODIFIER_GENERATOR_NODE_KINDS.includes(kind))
        throw new Error(`${found.label} is a generator; create it with modifier_generator_create`);
      if (stack.modifiers.length >= MODIFIER_STACK_MAX_MODIFIERS)
        throw new Error(`A stack holds at most ${MODIFIER_STACK_MAX_MODIFIERS} modifiers`);
      let next = modifierStackAdd(stack, kind);
      const added = next.modifiers.at(-1) as ModifierStackEntry;
      if (parameters) next = this.parametersApply(next, added.id, parameters, holder);
      return index === undefined ? next : modifierStackMove(next, added.id, index);
    });
  }

  /**
   * Removes a modifier.
   *
   * @param objectId Holder.
   * @param modifierId Modifier id.
   * @returns Updated stack.
   */
  entryRemove(objectId: string, modifierId: string): McpToolResult {
    return this.stackEdit(objectId, (stack, holder) => {
      this.entryRequire(stack, modifierId, holder, true);
      return modifierStackRemove(stack, modifierId);
    });
  }

  /**
   * Moves a modifier to a stack position.
   *
   * @param objectId Holder.
   * @param modifierId Modifier id.
   * @param index Target position.
   * @returns Updated stack.
   */
  entryMove(objectId: string, modifierId: string, index: number): McpToolResult {
    return this.stackEdit(objectId, (stack, holder) => {
      this.entryRequire(stack, modifierId, holder, true);
      if (holder.kind === 'generator' && index < 1) throw new Error('The generator stays first; use index 1 or more');
      return modifierStackMove(stack, modifierId, index);
    });
  }

  /**
   * Duplicates a modifier right after itself.
   *
   * @param objectId Holder.
   * @param modifierId Modifier id.
   * @returns Updated stack.
   */
  entryDuplicate(objectId: string, modifierId: string): McpToolResult {
    return this.stackEdit(objectId, (stack, holder) => {
      this.entryRequire(stack, modifierId, holder, true);
      if (stack.modifiers.length >= MODIFIER_STACK_MAX_MODIFIERS)
        throw new Error(`A stack holds at most ${MODIFIER_STACK_MAX_MODIFIERS} modifiers`);
      return modifierStackDuplicate(stack, modifierId);
    });
  }

  /**
   * Sets a modifier's enabled flag or display name.
   *
   * @param objectId Holder.
   * @param modifierId Modifier id.
   * @param patch Enabled and name.
   * @param patch.enabled New enabled flag.
   * @param patch.name New display name.
   * @returns Updated stack.
   */
  entrySet(objectId: string, modifierId: string, patch: { enabled?: boolean; name?: string }): McpToolResult {
    return this.stackEdit(objectId, (stack, holder) => {
      this.entryRequire(stack, modifierId, holder, false);
      const change: Partial<ModifierStackEntry> = {};
      if (patch.enabled !== undefined) change.enabled = patch.enabled;
      if (patch.name?.trim()) change.name = patch.name.trim();
      return modifierStackPatch(stack, modifierId, change);
    });
  }

  /**
   * Sets modifier parameters, validated against the kind's field descriptors.
   *
   * @param objectId Holder.
   * @param modifierId Modifier id.
   * @param parameters Values by key.
   * @returns Updated stack.
   */
  parametersSet(objectId: string, modifierId: string, parameters: Record<string, unknown>): McpToolResult {
    return this.stackEdit(objectId, (stack, holder) => this.parametersApply(stack, modifierId, parameters, holder));
  }

  /**
   * Applies one of a kind's presets.
   *
   * @param objectId Holder.
   * @param modifierId Modifier id.
   * @param presetId Preset id.
   * @returns Updated stack.
   */
  presetApply(objectId: string, modifierId: string, presetId: string): McpToolResult {
    return this.stackEdit(objectId, (stack, holder) => {
      const entry = this.entryRequire(stack, modifierId, holder, false);
      const kind = modifierStackKindFind(entry.kind);
      const preset = kind?.presets.find((candidate) => candidate.id === presetId);
      if (!kind || !preset)
        throw new Error(
          `No preset ${presetId}. Presets: ${(kind?.presets ?? []).map((candidate) => candidate.id).join(', ') || 'none'}`,
        );
      return modifierStackPatch(stack, modifierId, {
        parameters: modifierStackPresetApply(kind, entry.parameters, preset),
      });
    });
  }

  /**
   * Sets stack-wide settings: enabled, grouping and ignored objects.
   *
   * @param objectId Holder.
   * @param patch Settings to change.
   * @returns Updated stack.
   */
  stackSettingsSet(
    objectId: string,
    patch: Partial<Pick<ModifierStackSettings, 'enabled' | 'grouping' | 'excludedIds'>>,
  ): McpToolResult {
    return this.stackEdit(objectId, (stack) => {
      if (patch.grouping !== undefined && patch.grouping !== 'compound' && patch.grouping !== 'brush')
        throw new Error("grouping must be 'compound' or 'brush'");
      const excludedIds = patch.excludedIds?.map(
        (reference) => modifierObjectFind(this.host.worldObject, reference)?.uuid ?? reference,
      );
      return { ...stack, ...patch, ...(excludedIds ? { excludedIds } : {}) };
    });
  }

  /**
   * Bakes a holder's modifiers into plain brushes.
   *
   * @param objectId Holder.
   * @returns Result.
   */
  bake(objectId: string): McpToolResult {
    const holder = modifierHolderFind(this.host.worldObject, objectId);
    if (typeof holder === 'string') return failResult(holder);
    if (ModifierVolume.read(holder.object).modifiers.length === 0)
      return failResult('Nothing to bake: the stack is empty');
    this.host.commandStack.push(new CommandModifierVolumeBake(holder.object));
    this.afterMutation(`Baked ${holder.object.name}`);
    return okResult(`Baked ${holder.object.name} into brushes`);
  }

  /**
   * Presses a modifier's inspector button, such as Simulate, exactly like a
   * click. The button may keep working after this returns; its status line
   * shows in modifier_stack_get.
   *
   * @param objectId Holder.
   * @param modifierId Modifier id.
   * @param actionKey Key of the button field.
   * @returns Started, or the refusal.
   */
  actionRun(objectId: string, modifierId: string, actionKey: string): McpToolResult {
    const holder = modifierHolderFind(this.host.worldObject, objectId);
    if (typeof holder === 'string') return failResult(holder);
    const stack = ModifierVolume.read(holder.object);
    let entry: ModifierStackEntry;
    try {
      entry = this.entryRequire(stack, modifierId, holder, false);
    } catch (error) {
      return failResult(error instanceof Error ? error.message : String(error));
    }
    const kind = modifierStackKindFind(entry.kind);
    const actions = kind?.fields.filter((field) => field.type === 'action' && !field.hidden) ?? [];
    const field = actions.find((candidate) => candidate.key === actionKey);
    if (!kind || !field?.action)
      return failResult(
        `${kind?.label ?? entry.kind} has no button "${actionKey}". Buttons: ${actions.map((candidate) => candidate.key).join(', ') || 'none'}`,
      );
    if (!modifierActionAvailable(field, kind.normalizeParameters(entry.parameters)))
      return failResult(`${field.label} is not available for the current parameters`);
    const statusKey = `${holder.object.uuid}/${modifierId}/${actionKey}`;
    this.actionStatuses.set(statusKey, 'Running');
    const status = (text: string): void => {
      this.actionStatuses.set(statusKey, text);
    };
    const finished = (): void => {
      if (this.actionStatuses.get(statusKey) === 'Running') this.actionStatuses.set(statusKey, 'Done');
    };
    const target = { volume: holder.object, stepId: modifierId, commandStack: this.host.commandStack, status };
    void Promise.resolve()
      .then(() => field.action?.(target))
      .then(finished, (error: unknown) => status(error instanceof Error ? error.message : String(error)));
    return okResult(`Pressed ${field.label} on ${holder.object.name}; its status shows in modifier_stack_get`);
  }

  /**
   * Reads a holder's stack.
   *
   * @param object Holder object.
   * @returns Normalized stack.
   */
  stackRead(object: THREE.Object3D): ModifierStackSettings {
    return ModifierVolume.read(object);
  }

  /**
   * Rewrites one entry's parameters as one undo step; used by the curve tools.
   *
   * @param objectId Holder.
   * @param modifierId Modifier id.
   * @param change Builds the next parameters; throws to refuse.
   * @returns Updated stack.
   */
  entryParametersEdit(
    objectId: string,
    modifierId: string,
    change: (entry: ModifierStackEntry, holder: ModifierHolder) => Record<string, unknown>,
  ): McpToolResult {
    return this.stackEdit(objectId, (stack, holder) => {
      const entry = this.entryRequire(stack, modifierId, holder, false);
      return modifierStackPatch(stack, modifierId, { parameters: change(entry, holder) });
    });
  }

  /**
   * Validates and writes parameters of one entry.
   *
   * @param stack Current stack.
   * @param modifierId Modifier id.
   * @param parameters Values by key.
   * @param holder Holder, for error context.
   * @returns Next stack.
   */
  private parametersApply(
    stack: ModifierStackSettings,
    modifierId: string,
    parameters: Record<string, unknown>,
    holder: ModifierHolder,
  ): ModifierStackSettings {
    const entry = this.entryRequire(stack, modifierId, holder, false);
    const kind = modifierStackKindFind(entry.kind);
    if (!kind) throw new Error(`Modifier kind ${entry.kind} is not installed`);
    const resolve = (reference: string): string | null =>
      modifierObjectFind(this.host.worldObject, reference)?.uuid ?? null;
    const patched = modifierParametersPatch(kind, entry.parameters, parameters, resolve);
    this.warnings.push(...patched.warnings);
    return modifierStackPatch(stack, modifierId, { parameters: patched.parameters });
  }

  /**
   * Finds an entry, refusing to move or remove a generator's own modifier.
   *
   * @param stack Stack.
   * @param modifierId Modifier id.
   * @param holder Holder.
   * @param structural True for remove, move and duplicate.
   * @returns Entry.
   */
  private entryRequire(
    stack: ModifierStackSettings,
    modifierId: string,
    holder: ModifierHolder,
    structural: boolean,
  ): ModifierStackEntry {
    const index = stack.modifiers.findIndex((entry) => entry.id === modifierId);
    const entry = stack.modifiers[index];
    if (!entry)
      throw new Error(
        `No modifier ${modifierId} on ${holder.object.name}. Modifiers: ${stack.modifiers.map((candidate) => candidate.id).join(', ') || 'none'}`,
      );
    if (structural && holder.kind === 'generator' && index === 0)
      throw new Error("A generator's own modifier stays first; delete the generator node instead");
    return entry;
  }

  /**
   * Runs one undoable stack edit.
   *
   * @param objectId Holder reference.
   * @param change Builds the next stack; throws to refuse.
   * @returns Updated stack or the refusal.
   */
  private stackEdit(
    objectId: string,
    change: (stack: ModifierStackSettings, holder: ModifierHolder) => ModifierStackSettings,
  ): McpToolResult {
    const holder = modifierHolderFind(this.host.worldObject, objectId);
    if (typeof holder === 'string') return failResult(holder);
    this.warnings = [];
    const before = ModifierVolume.read(holder.object);
    let after: ModifierStackSettings;
    try {
      after = change(structuredClone(before), holder);
    } catch (error) {
      return failResult(error instanceof Error ? error.message : String(error));
    }
    if (JSON.stringify(after) === JSON.stringify(before))
      return okResult('No change', this.holderSummary(holder, true), { warnings: this.warnings });
    this.host.commandStack.push(new CommandModifierStackSet(holder.object, before, after));
    this.afterMutation(`Edited modifiers of ${holder.object.name}`);
    return okResult(`Updated modifiers of ${holder.object.name}`, this.holderSummary(holder, true), {
      warnings: this.warnings,
    });
  }

  /**
   * Poses a new volume or node from world placement arguments.
   *
   * @param object New object.
   * @param placement Pose, size and name.
   * @param parent Parent it will be added under.
   */
  private placementApply(object: THREE.Object3D, placement: ModifierPlacementArgs, parent: THREE.Object3D): void {
    parent.updateWorldMatrix(true, false);
    const world = dtoToVec3(placement.position, new THREE.Vector3());
    object.position.copy(parent.worldToLocal(world));
    object.rotation.copy(resolveEulerFromArgs(placement.rotationDegrees));
    if (placement.size) object.scale.copy(dtoToVec3(placement.size, object.scale));
    if (placement.name?.trim()) object.name = placement.name.trim();
  }

  /**
   * Selects a created object and reports it.
   *
   * @param object Created volume or node.
   * @returns Result.
   */
  private createdResult(object: THREE.Object3D): McpToolResult {
    if (object instanceof THREE.Mesh) this.host.selectionManager.selectObject(object);
    this.afterMutation(`Created ${object.name}`);
    const holder = modifierHolderFind(this.host.worldObject, object.uuid);
    const data = typeof holder === 'string' ? { objectId: object.uuid } : this.holderSummary(holder, true);
    return okResult(`Created ${object.name}`, data, { createdIds: [object.uuid] });
  }

  /**
   * Describes a holder and its stack.
   *
   * @param holder Holder.
   * @param detailed True includes normalized parameters.
   * @returns Plain summary.
   */
  private holderSummary(holder: ModifierHolder, detailed: boolean): Record<string, unknown> {
    const stack = ModifierVolume.read(holder.object);
    const brushId = SolidBrushVisual.getBrushId(holder.object);
    return {
      objectId: brushId ?? holder.object.uuid,
      name: holder.object.name,
      holder: holder.kind,
      enabled: stack.enabled,
      grouping: stack.grouping,
      excludedIds: stack.excludedIds,
      transform: {
        ...meshTransformSummary(holder.object),
        sizeIsScale: holder.kind === 'volume' || holder.kind === 'generator',
      },
      modifiers: stack.modifiers.map((entry) => this.entrySummary(entry, detailed, holder.object.uuid)),
    };
  }

  /**
   * Describes one stack entry.
   *
   * @param entry Entry.
   * @param detailed True includes normalized parameters.
   * @returns Plain summary.
   */
  private entrySummary(entry: ModifierStackEntry, detailed: boolean, holderUuid: string): Record<string, unknown> {
    const kind = modifierStackKindFind(entry.kind);
    const parameters = kind ? kind.normalizeParameters(entry.parameters) : entry.parameters;
    const inactive =
      kind?.fields
        .filter((field) => field.type !== 'action' && field.visible && !field.visible(parameters))
        .map((field) => field.key) ?? [];
    const actions =
      kind?.fields
        .filter((field) => field.type === 'action' && !field.hidden)
        .map((field) => {
          const status = this.actionStatuses.get(`${holderUuid}/${entry.id}/${field.key}`);
          return {
            key: field.key,
            label: field.label,
            available: modifierActionAvailable(field, parameters),
            ...(status ? { status } : {}),
          };
        }) ?? [];
    return {
      modifierId: entry.id,
      kind: entry.kind,
      name: entry.name,
      enabled: entry.enabled,
      summary: kind?.summary(parameters) ?? '',
      ...(detailed
        ? {
            parameters: kind ? modifierParametersRead(kind, entry.parameters) : parameters,
            inactiveParameters: inactive,
            ...(actions.length > 0 ? { actions } : {}),
          }
        : {}),
    };
  }

  /**
   * Refreshes viewports and the outliner after a change.
   *
   * @param status Status line text.
   */
  private afterMutation(status: string): void {
    this.host.refreshAfterWorldMutation();
    this.host.refreshOutliner();
    this.host.showStatus(status);
  }
}

/**
 * Returns whether a modifier button can be pressed: shown and not disabled for
 * the current parameters, as in the inspector.
 *
 * @param field Action field.
 * @param parameters Normalized parameters.
 * @returns True when available.
 */
function modifierActionAvailable(field: ModifierStackField, parameters: Record<string, unknown>): boolean {
  return (field.visible?.(parameters) ?? true) && !(field.actionDisabled?.(parameters) ?? false);
}
