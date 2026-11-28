import { SolidScriptPaths } from './solid_script_paths.js';
import { solidScriptIntoName } from './solid_script_into.js';
import { solidScriptShapeClone } from './solid_script_shape_clone.js';
import { solidScriptValueCopy, type SolidScriptValueCopyHost } from './solid_script_value_copy.js';
import { solidScriptNameIsSystem } from './solid_script_name_key.js';
import { solidScriptKindNamed } from './solid_script_kinds.js';
import type { SolidScriptBlockRun } from './solid_script_machine_types.js';
import {
  solidScriptNameIsDataWrite,
  solidScriptNameIsFaceCornerUvWrite,
  solidScriptNameIsModeWrite,
  solidScriptNameIsPositionWrite,
} from './solid_script_name_rules.js';
import { solidScriptEachUsed } from './solid_script_each_uses.js';
import { solidScriptModeWriteValue } from './solid_script_mode_write.js';
import { SOLID_SCRIPT_GEOMETRY_EPSILON } from './solid_script_geometry.js';
import {
  solidScriptPositionApply,
  solidScriptPositionAxis,
  solidScriptPositionByLeaf,
  solidScriptPositionItem,
  solidScriptPositionOwner,
  solidScriptPositionValue,
  type SolidScriptPositionMove,
} from './solid_script_position_write.js';
import { solidScriptFieldResolve } from './solid_script_field.js';
import {
  solidScriptListIndex,
  solidScriptListItemParse,
  solidScriptListItemRemove,
  solidScriptListItemWrite,
} from './solid_script_list_item.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptNameWritesMember } from './solid_script_name_writes_member.js';
import { solidScriptValueEditCheck, solidScriptValueInsideCheck } from './solid_script_value_share.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import {
  SolidScriptDictionary,
  SolidScriptElement,
  solidScriptValueNumbers,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';
import type { SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import {
  solidScriptFaceCornerUvs,
  solidScriptFaceUvsFit,
  solidScriptMeshFaceUvsWrite,
  solidScriptSolidFaceUvsWrite,
  solidScriptUvsFromValue,
} from './solid_script_uvs.js';
import {
  SOLID_SCRIPT_LOCAL_PREFIX,
  SOLID_SCRIPT_PERSISTENT_PREFIX,
  SOLID_SCRIPT_NAME,
  SOLID_SCRIPT_NAMES_PLAIN,
  SolidScriptMachineVariables,
  solidScriptLocalBare,
  solidScriptMemberParts,
  solidScriptVectorComponent,
  solidScriptVectorComponentWrite,
  type SolidScriptSelectedKind,
  type SolidScriptVariableWhere,
} from './solid_script_machine_variables.js';

/** The $Selected lists a line may set, by kind. */
const SOLID_SCRIPT_SELECTED_LIST = /^\$selected\.(objects|faces|edges|vertices)$/;

/** One corner a position write will move, as it was before the line. */
interface SolidScriptPositionTarget {
  leaf: SolidScriptGeometryLeaf;
  position: SolidScriptPositionMove['from'];
  element: SolidScriptElement;
}

/**
 * Every write of a running script to a variable goes through here: Set, Into
 * and the other fields that write a variable, the list lines, loop names and
 * Call results. Variables are dynamic: any write may give a variable a value of
 * another kind.
 */
export abstract class SolidScriptMachineWrites extends SolidScriptMachineVariables {
  /** Paths of the run. */
  protected readonly paths = new SolidScriptPaths();

  /** Makes the new objects and paths of a copy. */
  private readonly copyHost: SolidScriptValueCopyHost = {
    objectCopy: (element, copy) => this.objectCopied(element, copy),
    pathCopy: (element) => this.paths.created(element.path, element.name),
    objectDataValues: (element) => this.elements.dataEntries(element).map((entry) => entry.value),
  };

  /**
   * Makes a deep copy of a value for Copy and Set with Copy on.
   *
   * @param value Value to copy.
   * @param shown Name it was read from, for messages.
   * @returns The copy.
   */
  valueCopied(value: SolidScriptValue, shown: string): SolidScriptValue {
    return solidScriptValueCopy(value, shown, this.copyHost);
  }

  /**
   * Makes an independent second solid or mesh, with its Mode and a copy of its
   * .Data. It is kept only by the name it is written to, until Output.
   *
   * @param element Solid or mesh.
   * @param copy Copies one .Data value.
   * @returns The new object.
   */
  private objectCopied(
    element: SolidScriptElement,
    copy: (value: SolidScriptValue) => SolidScriptValue,
  ): SolidScriptElement {
    const leaf = this.elements.leaf(element);
    const clone = solidScriptShapeClone(leaf) as SolidScriptGeometryLeaf;
    this.elements.modeRoleCopy(leaf, clone);
    const made = this.elements.brush(clone);
    const data = this.elements.data(made);
    for (const entry of this.elements.dataEntries(element))
      this.elements.dataWrite(data, solidScriptNameKey(entry.name), entry.name, copy(entry.value));
    return made;
  }

  /**
   * Returns what a solid or mesh became after later writes.
   *
   * @param leaf Solid or mesh.
   * @returns Latest version.
   */
  protected abstract leafLatest(leaf: SolidScriptGeometryLeaf): SolidScriptGeometryLeaf;

  /**
   * Replaces a solid or mesh with a later version.
   *
   * @param leaf Solid or mesh to replace.
   * @param by Replacement.
   */
  protected abstract leafRewrite(leaf: SolidScriptGeometryLeaf, by: SolidScriptGeometryLeaf): void;

  /**
   * Writes a user value under .Data, such as Face.Data.Height or
   * Prices.Data.Wood, to one element, every element of a list or a Dictionary.
   *
   * @param written Name as written.
   * @param scope Scope of the line.
   * @param valueOf Value of each element, from it, its number and how many
   *   there are.
   * @returns True when the name was such a value.
   */
  protected dataSet(
    written: string,
    scope: SolidScriptScope,
    valueOf: (item: SolidScriptValue, index: number, count: number) => SolidScriptValue,
  ): boolean {
    const parts = solidScriptMemberParts(written);
    const at = parts.length - 2;
    if (at < 1 || parts[at]!.toLowerCase() !== 'data') return false;
    const owner = this.fieldVariable(solidScriptNameKey(parts.slice(0, at).join('.')), scope);
    const last = parts[parts.length - 1]!;
    const name = last.includes('[')
      ? solidScriptValueText(solidScriptFieldResolve('value', last, this.fieldContext(scope))).trim()
      : last;
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(`"${name}" cannot be a Data key; keys use letters, digits and _, not starting with a digit`);
    const items = Array.isArray(owner) ? owner : [owner];
    const shown = parts.slice(0, at).join('.');
    for (const [index, item] of items.entries())
      this.dataSetItem(item, name, valueOf(item, index, items.length), shown);
    this.persistentOwnerKeep(shown, scope);
    return true;
  }

  /**
   * Writes one user value under the .Data of one element or Dictionary.
   *
   * @param item Element or Dictionary.
   * @param name Key as written.
   * @param value Value to keep.
   * @param shown Owner name, for messages.
   */
  private dataSetItem(item: SolidScriptValue, name: string, value: SolidScriptValue, shown: string): void {
    if (!(item instanceof SolidScriptElement))
      throw new Error(
        `only solids, faces, edges, corners and dictionaries have .Data; ${shown} is ${solidScriptKindNamed(item)}`,
      );
    const data = item.kind === 'data' ? item : this.elements.data(item);
    this.listEditCheck(data, shown, value);
    this.elements.dataWrite(data, solidScriptNameKey(name), name, value);
  }

  /**
   * Stores a persistent Dictionary after a .Data write, so the change is kept
   * between runs.
   *
   * @param written Owner name as written, such as $Persistent.Prices.
   * @param scope Scope of the line.
   */
  private persistentOwnerKeep(written: string, scope: SolidScriptScope): void {
    const name = solidScriptNameKey(written);
    if (!name.startsWith(SOLID_SCRIPT_PERSISTENT_PREFIX)) return;
    const where = this.variableWhere(name, scope);
    if (where.persistent) this.persistentKeep(where.name);
  }

  /**
   * Writes Face.UVs, or the UVs of every face in a list, from a list of U and V
   * pairs, one per corner.
   *
   * @param written Name as written.
   * @param scope Scope of the line.
   * @param value Corner UVs.
   * @returns True when the name was Face.UVs or a list of faces' UVs.
   */
  protected uvsSet(written: string, scope: SolidScriptScope, value: SolidScriptValue): boolean {
    const parts = solidScriptMemberParts(written);
    const last = parts[parts.length - 1];
    if (parts.length < 2 || last?.toLowerCase() !== 'uvs') return false;
    const owner = this.fieldVariable(solidScriptNameKey(parts.slice(0, -1).join('.')), scope);
    const uvs = solidScriptUvsFromValue(value);
    const items = Array.isArray(owner) ? owner : [owner];
    for (const item of items) this.uvsSetFace(item, uvs, parts.slice(0, -1).join('.'));
    return true;
  }

  /**
   * Writes corner UVs onto one face value.
   *
   * @param item Face element.
   * @param uvs Corner UVs.
   * @param shown Owner name, for messages.
   */
  private uvsSetFace(item: SolidScriptValue, uvs: readonly [number, number][], shown: string): void {
    if (!(item instanceof SolidScriptElement) || item.kind !== 'face')
      throw new Error(`only faces have .UVs; ${shown} is ${solidScriptKindNamed(item)}`);
    const [face] = this.elements.faces(item);
    if (!face) throw new Error(`${String(item)} was cut away`);
    if (uvs.length !== face.corners.length)
      throw new Error(`Face.UVs needs ${face.corners.length} corners, not ${uvs.length}`);
    const latest = this.leafLatest(face.leaf);
    if (latest.kind === 'mesh') {
      this.leafRewrite(latest, solidScriptMeshFaceUvsWrite(latest, face.index, uvs));
      return;
    }
    if (latest.kind === 'solid')
      this.leafRewrite(latest, solidScriptSolidFaceUvsWrite(latest, [solidScriptFaceUvsFit(face, uvs)]));
  }

  /**
   * Writes FaceCorner.UV, or the UV of every face corner in a list, changing
   * only that face's use of the corner.
   *
   * @param written Name as written.
   * @param scope Scope of the line.
   * @param valueOf UV of one face corner, from the corner, its number in the
   *   list and how many there are.
   * @returns True when the name was a face corner's UV.
   */
  protected faceCornerUvSet(
    written: string,
    scope: SolidScriptScope,
    valueOf: (item: SolidScriptValue, index: number, count: number) => SolidScriptValue,
  ): boolean {
    if (!solidScriptNameIsFaceCornerUvWrite(written)) return false;
    const parts = solidScriptMemberParts(written);
    const shown = parts.slice(0, -1).join('.');
    const owner = this.fieldVariable(solidScriptNameKey(shown), scope);
    const items = Array.isArray(owner) ? owner : [owner];
    for (const [index, item] of items.entries())
      this.faceCornerUvWrite(item, valueOf(item, index, items.length), shown);
    return true;
  }

  /**
   * Writes the UV of one face corner of a mesh.
   *
   * @param item Face corner element.
   * @param value U, V and an unused Z.
   * @param shown Owner name, for messages.
   */
  private faceCornerUvWrite(item: SolidScriptValue, value: SolidScriptValue, shown: string): void {
    if (!(item instanceof SolidScriptElement) || item.kind !== 'facecorner')
      throw new Error(`only face corners have .UV; ${shown} is ${solidScriptKindNamed(item)}`);
    const at = this.elements.faceCornerAt(item);
    if (!at) throw new Error(`${String(item)} was cut away`);
    const latest = this.leafLatest(at.face.leaf);
    if (latest.kind !== 'mesh')
      throw new Error('only the face corners of meshes keep a UV of their own; on a solid, set Face.UVs instead');
    const [u, v, ...rest] = solidScriptValueNumbers(value) ?? [];
    if (u === undefined || v === undefined || rest.length > 1)
      throw new Error('FaceCorner.UV needs two or three numbers, such as 0.5, 0.5, 0');
    const uvs = solidScriptFaceCornerUvs(at.face);
    uvs[at.index] = [u, v];
    this.leafRewrite(latest, solidScriptMeshFaceUvsWrite(latest, at.face.index, uvs));
  }

  /**
   * Sets a variable after checking its name and that lines may change it. A
   * list, Dictionary or any other value that is not a number or text is not
   * copied: the name becomes one more name for it.
   *
   * @param scope Scope of the line.
   * @param written Name.
   * @param given Value.
   */
  protected variableSet(scope: SolidScriptScope, written: string, given: SolidScriptValue): void {
    const value = given;
    const name = this.nameKey(written);
    if (SOLID_SCRIPT_NAMES_PLAIN.has(name)) {
      this.writableCheck(name, name);
      const home = scope.variableHas(name) ? scope : this.root;
      home.variableSet(name, value);
      return;
    }
    if (solidScriptNameIsSystem(name)) return this.variableSetSystem(scope, written, name, value);
    if (solidScriptNameWritesMember(written) && this.memberSet(scope, written, value)) return;
    const locals = name.startsWith(SOLID_SCRIPT_LOCAL_PREFIX) ? this.frameFunction()?.locals : undefined;
    const bare = locals ? solidScriptLocalBare(name) : '';
    if (locals && SOLID_SCRIPT_NAME.test(bare)) return locals.variableSet(bare, value);
    const where = this.variableWhere(name, scope);
    const component = solidScriptVectorComponent(where.name);
    if (component && !where.scope.variableHas(where.name)) return this.variableSetComponent(where, component, value);
    this.variableSetNamed(scope, where, value);
  }

  /**
   * Sets a member of an element, such as Face.Data.Height, Faces.UVs,
   * FaceCorner.UV, Vertex.Position or Solid.Mode.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param value Value.
   * @returns True when the name was such a member.
   */
  private memberSet(scope: SolidScriptScope, written: string, value: SolidScriptValue): boolean {
    return (
      this.dataSet(written, scope, () => value) ||
      this.uvsSet(written, scope, value) ||
      this.faceCornerUvSet(written, scope, () => value) ||
      this.positionAssign(scope, written, value) ||
      this.modeSet(written, scope, value)
    );
  }

  /**
   * Writes a Set value, evaluating a Vertex.Position formula once per corner
   * with $Vertex and $Index, from the geometry as it was before the line, and a
   * Data or FaceCorner.UV write through a list once per item with $Item and
   * $Index.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param key Value field of the line.
   * @param run Line run, for the value.
   * @param copied Whether the name gets a deep copy of the value.
   */
  protected variableWrite(
    scope: SolidScriptScope,
    written: string,
    key: string,
    run: SolidScriptBlockRun,
    copied = false,
  ): void {
    const member = solidScriptNameWritesMember(written);
    if (member && this.positionWriteEach(scope, written, key, run)) return;
    if (member && solidScriptEachUsed(run.source(key))) {
      const each = (item: SolidScriptValue, index: number, count: number): SolidScriptValue =>
        this.valueKept(run, key, run.valueWith(key, { $Item: item, $Index: index, $Count: count }), copied);
      if (solidScriptNameIsDataWrite(written) && this.dataSet(written, scope, each)) return;
      if (this.faceCornerUvSet(written, scope, each)) return;
    }
    this.variableSet(scope, written, this.valueKept(run, key, run.valueItems(key), copied));
  }

  /**
   * Gives the value a Set line keeps: the value itself, or with Copy on a deep
   * copy of it.
   *
   * @param run Line run, for the name the value was read from.
   * @param key Value field of the line.
   * @param value Value worked out.
   * @param copied Whether Copy is on.
   * @returns Value to keep.
   */
  private valueKept(run: SolidScriptBlockRun, key: string, value: SolidScriptValue, copied: boolean): SolidScriptValue {
    return copied ? this.valueCopied(value, solidScriptIntoName(run.source(key))) : value;
  }

  /**
   * Sets every targeted corner to one already-read value.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param value New position, or a number on one axis.
   * @returns True when the name was a corner position.
   */
  /**
   * Writes Brush.Mode, or the Mode of every brush in a list, including
   * [$Selected.Objects.Modes]. The value must be Additive, Subtractive or
   * Intersecting.
   *
   * @param written Name as written.
   * @param scope Scope of the line.
   * @param value New Mode.
   * @returns True when the name was a brush Mode.
   */
  protected modeSet(written: string, scope: SolidScriptScope, value: SolidScriptValue): boolean {
    if (!solidScriptNameIsModeWrite(written)) return false;
    const parts = solidScriptMemberParts(written);
    const ownerName = parts.slice(0, -1).join('.');
    const owner = this.fieldVariable(solidScriptNameKey(ownerName), scope);
    if (owner === undefined) throw new Error(`${ownerName} is not set`);
    const mode = solidScriptModeWriteValue(value);
    const items = Array.isArray(owner) ? owner : [owner];
    for (const item of items) this.modeSetBrush(item, mode, ownerName);
    return true;
  }

  /**
   * Writes Mode onto one brush and leaves it in the output as that CSG Mode.
   *
   * @param item Brush element.
   * @param mode Mode to set.
   * @param shown Owner name, for messages.
   */
  private modeSetBrush(
    item: SolidScriptValue,
    mode: ReturnType<typeof solidScriptModeWriteValue>,
    shown: string,
  ): void {
    if (!(item instanceof SolidScriptElement) || item.kind !== 'brush' || item.mesh)
      throw new Error(`only solids have .Mode; ${shown} is ${solidScriptKindNamed(item)}`);
    const latest = this.leafLatest(this.elements.leaf(item));
    if (latest.kind !== 'solid') throw new Error(`only solids have .Mode; ${shown} is ${solidScriptKindNamed(item)}`);
    this.leafRewrite(latest, { ...latest, mode });
  }

  private positionAssign(scope: SolidScriptScope, written: string, value: SolidScriptValue): boolean {
    if (!solidScriptNameIsPositionWrite(written)) return false;
    const targets = this.positionTargets(scope, written);
    const axis = solidScriptPositionAxis(written);
    const moves = targets.map((target) => ({
      from: target.position.clone(),
      to: solidScriptPositionValue(value, target.position, axis),
    }));
    this.positionCommit(targets, moves);
    return true;
  }

  /**
   * Evaluates the value once per corner with $Vertex and $Index, then applies
   * every move together.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param key Value field of the line.
   * @param run Line run, for the value.
   * @returns True when the name was a corner position.
   */
  private positionWriteEach(scope: SolidScriptScope, written: string, key: string, run: SolidScriptBlockRun): boolean {
    if (!solidScriptNameIsPositionWrite(written)) return false;
    const targets = this.positionTargets(scope, written);
    const axis = solidScriptPositionAxis(written);
    const moves = targets.map((target, index) => {
      const assigned = run.valueWith(key, { $Vertex: target.element, $Index: index, $Count: targets.length });
      return { from: target.position.clone(), to: solidScriptPositionValue(assigned, target.position, axis) };
    });
    this.positionCommit(targets, moves);
    return true;
  }

  /**
   * Moves the corners of brushes, faces, edges or vertices, each to the
   * position a line works out for it from the geometry before the line, then
   * applies every move together, as Set Vertex.Position does.
   *
   * @param items Elements that own the corners.
   * @param label Command, for messages.
   * @param to New position of a corner from it, its number and how many there
   *   are, or null to leave it.
   */
  positionsMove(
    items: readonly SolidScriptValue[],
    label: string,
    to: (vertex: SolidScriptElement, index: number, count: number) => SolidScriptValue | null,
  ): void {
    const targets: SolidScriptPositionTarget[] = [];
    for (const item of items) this.positionTargetAdd(targets, item, label);
    const moved = targets.flatMap((target, index) => {
      const value = to(target.element, index, targets.length);
      return value === null
        ? []
        : [
            {
              target,
              move: { from: target.position.clone(), to: solidScriptPositionValue(value, target.position, undefined) },
            },
          ];
    });
    this.positionCommit(
      moved.map((entry) => entry.target),
      moved.map((entry) => entry.move),
    );
  }

  /**
   * Lists the unique corners a position write sets, as they were before the
   * line.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @returns Corners, each with its solid or mesh and vertex element.
   */
  private positionTargets(scope: SolidScriptScope, written: string): SolidScriptPositionTarget[] {
    const ownerName = solidScriptPositionOwner(written);
    const owner = this.fieldVariable(solidScriptNameKey(ownerName), scope);
    if (owner === undefined) throw new Error(`${ownerName} is not set`);
    const targets: SolidScriptPositionTarget[] = [];
    for (const item of Array.isArray(owner) ? owner : [owner]) this.positionTargetAdd(targets, item, ownerName);
    if (targets.length === 0) throw new Error(`${written} has no vertices to set`);
    const item = solidScriptPositionItem(written);
    return item === null ? targets : [this.positionTargetPicked(targets, item, ownerName, scope)];
  }

  /**
   * Picks the one corner a write such as Vertices.Positions(2) sets.
   *
   * @param targets Every corner of the owner, in order.
   * @param item Item number as written.
   * @param ownerName Name of the owner, for messages.
   * @param scope Scope of the line, for the item number.
   * @returns The corner.
   */
  private positionTargetPicked(
    targets: readonly SolidScriptPositionTarget[],
    item: string,
    ownerName: string,
    scope: SolidScriptScope,
  ): SolidScriptPositionTarget {
    const shown = `${ownerName}.Positions`;
    if (item.trim() === '') throw new Error(`${shown}() needs a corner number, such as ${shown}(0)`);
    const at = solidScriptListIndex(shown, this.indexValue(item, scope), (name) => name);
    const target = targets[at];
    if (!target)
      throw new Error(`${shown}(${at}) is past the end: there are ${targets.length} corners, numbered from 0`);
    return target;
  }

  /**
   * Adds the corners of one brush, face, edge or vertex to a position write.
   *
   * @param targets Corners collected so far.
   * @param item Element that owns the corners.
   * @param ownerName Name of the owner, for the message.
   */
  private positionTargetAdd(targets: SolidScriptPositionTarget[], item: SolidScriptValue, ownerName: string): void {
    if (!(item instanceof SolidScriptElement) || item.kind === 'data')
      throw new Error(
        `Position can only be set on a solid, face, edge or vertex; ${ownerName} is ${solidScriptKindNamed(item)}`,
      );
    const leaf = this.elements.leaf(item);
    for (const vertex of this.elements.vertices(item)) {
      if (
        targets.some(
          (known) => known.leaf === leaf && known.position.distanceTo(vertex.position) <= SOLID_SCRIPT_GEOMETRY_EPSILON,
        )
      )
        continue;
      targets.push({ leaf, position: vertex.position.clone(), element: this.elements.vertex(leaf, vertex) });
    }
  }

  /**
   * Applies every corner move of the line together; a brush may be non-convex
   * until the output is checked.
   *
   * @param targets Corners being set.
   * @param moves Moves in the same order, from the positions before the line.
   */
  private positionCommit(
    targets: readonly SolidScriptPositionTarget[],
    moves: readonly SolidScriptPositionMove[],
  ): void {
    for (const group of solidScriptPositionByLeaf(targets, moves, (leaf) => this.leafLatest(leaf)))
      this.leafRewrite(group.leaf, solidScriptPositionApply(this.leafLatest(group.leaf), group.moves));
  }

  /**
   * Sets a name starting with $: a corner position, Mode, UVs or a value under
   * .Data reached through a system value, one of the $Selected lists or an item
   * of one. Anything else can only be read, which stops the line.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param name Its key.
   * @param value Value.
   */
  private variableSetSystem(scope: SolidScriptScope, written: string, name: string, value: SolidScriptValue): void {
    if (this.memberSet(scope, written, value)) return;
    const item = solidScriptListItemParse(name);
    const kind = SOLID_SCRIPT_SELECTED_LIST.exec(item?.name ?? name)?.[1] as SolidScriptSelectedKind | undefined;
    if (!kind)
      throw new Error(
        `[${written}] is a built-in value and can only be read; through a system value you can set Vertex.Position, Face.UVs, FaceCorner.UV, Object.Mode and the values under .Data, such as [$Selected.Vertices.Positions(0)], and the $Selected lists`,
      );
    if (!item) {
      this.selected[kind] = Array.isArray(value) ? value : value === undefined ? [] : [value];
      return;
    }
    const list = this.selected[kind] ?? [];
    this.listEditCheck(list, item.name, value);
    const index = item.index === '' ? null : this.indexValue(item.index, scope);
    this.selected[kind] = solidScriptListItemWrite(item.name, list, index, value, this.nameShown);
  }

  /**
   * Sets one part of a vector variable, such as Pos.Y.
   *
   * @param where Where the name lives.
   * @param component Vector and part.
   * @param value Value of the part.
   */
  private variableSetComponent(
    where: SolidScriptVariableWhere,
    component: NonNullable<ReturnType<typeof solidScriptVectorComponent>>,
    value: SolidScriptValue,
  ): void {
    if (!where.scope.variableHas(component.name)) {
      const shown = this.nameShown(component.name);
      throw new Error(`there is no vector [${shown}] to change; set it first, such as Set ${shown} to 0, 0, 0`);
    }
    const vector = where.scope.variableGet(component.name);
    if (!where.local && !where.persistent) this.writableCheck(component.name);
    this.listEditCheck(vector, component.name);
    const changed = solidScriptVectorComponentWrite(component, vector, value);
    where.scope.variableSet(component.name, changed);
    if (where.persistent) this.persistentKeep(component.name);
  }

  /**
   * Sets a variable by its name, or one item of a list such as Points(2).
   *
   * @param scope Scope of the line.
   * @param where Where the name lives.
   * @param value Value.
   */
  private variableSetNamed(scope: SolidScriptScope, where: SolidScriptVariableWhere, value: SolidScriptValue): void {
    const item = solidScriptListItemParse(where.name);
    const base = item?.name ?? where.name;
    this.nameCheck(base, 'a variable');
    if (!where.local) this.writableCheck(base);
    const home = !where.local && !where.persistent && !scope.variableHas(base) ? this.root : where.scope;
    const index = item && item.index !== '' ? this.indexValue(item.index, scope) : null;
    if (item) this.listEditCheck(home.variableGet(base), base, value);
    const whole = item ? solidScriptListItemWrite(base, home.variableGet(base), index, value, this.nameShown) : value;
    home.variableSet(base, whole);
    if (where.persistent) this.persistentKeep(base);
  }

  /**
   * Forgets a variable for a Delete Variable line.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   */
  variableDeleteLine(scope: SolidScriptScope, name: string): void {
    const where = this.variableWhere(name, scope);
    this.nameCheck(where.name, 'a variable');
    if (!where.local) this.writableCheck(where.name);
    if (!where.scope.variableDelete(where.name))
      throw new Error(
        `there is no variable [${this.nameShown(solidScriptNameKey(name))}] to delete; set it on a line above this one`,
      );
    if (where.persistent) this.persistentKeep(where.name);
  }

  /**
   * Empties a variable for a Clear Variable line with the empty value of the
   * kind it holds: a list becomes an empty list, a Dictionary one with no keys,
   * a number 0, a Yes/No No and anything else empty text; a name not set yet
   * becomes an empty list, ready for Add Item.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   */
  variableClearLine(scope: SolidScriptScope, name: string): void {
    const where = this.variableWhere(name, scope);
    const old = where.scope.variableHas(where.name) ? where.scope.variableGet(where.name) : undefined;
    this.variableSet(scope, name, solidScriptValueEmpty(old));
  }

  /**
   * Changes a list variable in place for a list line, so every name for the
   * list sees the change. With create, a name not set yet starts as an empty
   * list.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   * @param change Changes the items.
   * @param create Whether a missing name becomes a list.
   */
  listChange(
    scope: SolidScriptScope,
    name: string,
    change: (items: SolidScriptValue[]) => void,
    create: boolean,
  ): void {
    const where = this.variableWhere(name, scope);
    if (create && !where.scope.variableHas(where.name)) {
      const made: SolidScriptValue[] = [];
      change(made);
      this.variableSet(scope, name, made);
      return;
    }
    const items = this.listRead(scope, name);
    if (!where.local) this.writableCheck(where.name);
    this.listEditCheck(items, where.name);
    change(items);
    if (where.persistent) this.persistentKeep(where.name);
  }

  /**
   * Stops a line that would change a list or Dictionary lines may only read, or
   * put one inside itself.
   *
   * @param target List or Dictionary about to change.
   * @param name Its name key.
   * @param value Value going in, when there is one.
   */
  protected listEditCheck(target: SolidScriptValue, name: string, value?: SolidScriptValue): void {
    const shown = this.nameShown(solidScriptNameKey(name));
    solidScriptValueEditCheck(target, shown);
    if (value !== undefined) solidScriptValueInsideCheck(target, value, shown);
  }

  /**
   * Changes a Dictionary variable in place for an Add Entry, Remove Entry or
   * Merge Dictionary line. With create, a name not set yet starts as an empty
   * Dictionary.
   *
   * @param scope Scope of the line.
   * @param name Name as written.
   * @param create Whether a missing name becomes a Dictionary.
   * @param change Changes the Dictionary; it checks before it changes, so a
   *   line that stops leaves the Dictionary as it was.
   */
  dictionaryChange(
    scope: SolidScriptScope,
    name: string,
    create: boolean,
    change: (dictionary: SolidScriptDictionary) => void,
  ): void {
    const where = this.variableWhere(name, scope);
    const made = create && !where.scope.variableHas(where.name);
    const dictionary = made ? new SolidScriptDictionary() : this.dictionaryRead(scope, name);
    if (!where.local) this.writableCheck(where.name);
    this.listEditCheck(dictionary, where.name);
    change(dictionary);
    if (made) this.variableSet(scope, name, dictionary);
    else if (where.persistent) this.persistentKeep(where.name);
  }

  /**
   * Takes one item out of a list for a Remove Item line, such as Points(2), or
   * the last one for Points().
   *
   * @param scope Scope of the line.
   * @param target Item as written.
   */
  variableItemRemove(scope: SolidScriptScope, target: string): void {
    const where = this.variableWhere(target, scope);
    const item = solidScriptListItemParse(where.name);
    if (!item) throw new Error(`"${target}" is not a list item; write list(2), or list() for the last item`);
    if (!where.local) this.writableCheck(item.name);
    if (!where.scope.variableHas(item.name))
      throw new Error(`there is no variable [${this.nameShown(item.name)}]; set it on a line above this one`);
    const index = item.index === '' ? null : this.indexValue(item.index, scope);
    this.listEditCheck(where.scope.variableGet(item.name), item.name);
    const left = solidScriptListItemRemove(item.name, where.scope.variableGet(item.name), index, this.nameShown);
    this.variableSet(scope, target.trim().replace(/\s*\(.*\)$/s, ''), left);
  }
}

/**
 * Gives a new empty value of the kind a value holds, for Clear Variable: an
 * empty list for a list or nothing, an empty Dictionary for a Dictionary, 0 for
 * a number, No for a Yes/No and empty text for anything else. Other names for
 * the old value keep it.
 *
 * @param old Value the variable holds, undefined when it is not set.
 * @returns Empty value.
 */
function solidScriptValueEmpty(old: SolidScriptValue): SolidScriptValue {
  if (old === undefined || Array.isArray(old)) return [];
  if (old instanceof SolidScriptDictionary) return new SolidScriptDictionary();
  if (typeof old === 'number') return 0;
  return typeof old === 'boolean' ? false : '';
}
