import { solidScriptFieldResolve } from './solid_script_field.js';
import { SOLID_SCRIPT_GEOMETRY_EPSILON, type SolidScriptGeometryLeaf } from './solid_script_geometry.js';
import { solidScriptKindNamed } from './solid_script_kinds.js';
import { solidScriptListIndex } from './solid_script_list_item.js';
import {
  SOLID_SCRIPT_NAME,
  SOLID_SCRIPT_PERSISTENT_PREFIX,
  SolidScriptMachineVariables,
} from './solid_script_machine_variables.js';
import { solidScriptModeWriteValue } from './solid_script_mode_write.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptMemberWriteParse, type SolidScriptMemberWrite } from './solid_script_name_rules.js';
import {
  solidScriptPositionApply,
  solidScriptPositionByLeaf,
  solidScriptPositionValue,
  type SolidScriptPositionMove,
} from './solid_script_position_write.js';
import type { SolidScriptScope } from './solid_script_scope.js';
import {
  solidScriptFaceCornerUvs,
  solidScriptFaceUvsFit,
  solidScriptMeshFaceUvsWrite,
  solidScriptSolidFaceUvsWrite,
  solidScriptUvsFromValue,
} from './solid_script_uvs.js';
import { solidScriptValueEditCheck, solidScriptValueInsideCheck } from './solid_script_value_share.js';
import {
  SolidScriptElement,
  solidScriptValueNumbers,
  solidScriptValueText,
  type SolidScriptValue,
} from './solid_script_value.js';

/** One corner a position write will move, as it was before the line. */
interface SolidScriptPositionTarget {
  leaf: SolidScriptGeometryLeaf;
  position: SolidScriptPositionMove['from'];
  element: SolidScriptElement;
}

/** One item a member write sets, with its number and how many there are. */
interface SolidScriptMemberItem<Item> {
  item: Item;
  index: number;
  count: number;
}

/**
 * Works out the value one item gets, from it, its number and how many there
 * are.
 */
export type SolidScriptMemberValue = (item: SolidScriptValue, index: number, count: number) => SolidScriptValue;

/**
 * What the items of each member are called, for the messages about item
 * numbers.
 */
const SOLID_SCRIPT_MEMBER_ITEMS: Readonly<Record<SolidScriptMemberWrite['kind'], { one: string; many: string }>> = {
  position: { one: 'a corner', many: 'corners' },
  mode: { one: 'a solid', many: 'solids' },
  uvs: { one: 'a face', many: 'faces' },
  uv: { one: 'a face corner', many: 'face corners' },
  data: { one: 'an item', many: 'items' },
};

/**
 * Writes to the members of elements: .Data values, Face.UVs, FaceCorner.UV,
 * Vertex.Position and Object.Mode. Every member is written the same way: the
 * owner is one element or a list, the member goes to every item, and a number
 * on the member, such as Positions(2), picks the one item of the items the name
 * reads as.
 */
export abstract class SolidScriptMachineMembers extends SolidScriptMachineVariables {
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
   * Sets a member of an element, such as Face.Data.Height, Faces.UVs(2),
   * FaceCorner.UV, Vertices.Positions(0) or Solid.Mode, to one value.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param value Value.
   * @returns True when the name was such a member.
   */
  protected memberSet(scope: SolidScriptScope, written: string, value: SolidScriptValue): boolean {
    return this.memberWrite(scope, written, () => value);
  }

  /**
   * Sets a member of an element, or of each item of a list, working the value
   * out once per item.
   *
   * @param scope Scope of the line.
   * @param written Name as written.
   * @param valueOf Value of each item, from it, its number and how many there
   *   are.
   * @returns True when the name was such a member.
   */
  protected memberWrite(scope: SolidScriptScope, written: string, valueOf: SolidScriptMemberValue): boolean {
    const write = solidScriptMemberWriteParse(written);
    if (!write) return false;
    if (write.kind === 'position') this.positionWrite(scope, write, valueOf);
    else if (write.kind === 'data') this.dataWrite(scope, write, valueOf);
    else
      for (const { item, index, count } of this.memberItems(scope, write)) {
        const value = valueOf(item, index, count);
        if (write.kind === 'uvs') this.uvsSetFace(item, solidScriptUvsFromValue(value), write.owner);
        else if (write.kind === 'uv') this.faceCornerUvWrite(item, value, write.owner);
        else this.modeSetBrush(item, solidScriptModeWriteValue(value), write.owner);
      }
    return true;
  }

  /**
   * Lists the items a member write sets: every item of the owner, or the one a
   * number on the member picks.
   *
   * @param scope Scope of the line.
   * @param write The write.
   * @returns Items with their numbers.
   */
  private memberItems(
    scope: SolidScriptScope,
    write: SolidScriptMemberWrite,
  ): SolidScriptMemberItem<SolidScriptValue>[] {
    const owner = this.fieldVariable(solidScriptNameKey(write.owner), scope);
    if (owner === undefined) throw new Error(`${write.owner} is not set`);
    return this.memberPicked(scope, write, Array.isArray(owner) ? owner : [owner]);
  }

  /**
   * Picks from the items a member write reads as the one a number on the member
   * names, or keeps them all.
   *
   * @param scope Scope of the line, for the number.
   * @param write The write.
   * @param items Every item, in order.
   * @returns Items with their numbers.
   */
  private memberPicked<Item>(
    scope: SolidScriptScope,
    write: SolidScriptMemberWrite,
    items: readonly Item[],
  ): SolidScriptMemberItem<Item>[] {
    const all = items.map((item, index) => ({ item, index, count: items.length }));
    if (write.item === null) return all;
    const noun = SOLID_SCRIPT_MEMBER_ITEMS[write.kind];
    if (write.item.trim() === '')
      throw new Error(`${write.shown}() needs ${noun.one} number, such as ${write.shown}(0)`);
    const at = solidScriptListIndex(write.shown, this.indexValue(write.item, scope), (name) => name);
    const picked = all[at];
    if (!picked)
      throw new Error(`${write.shown}(${at}) is past the end: there are ${items.length} ${noun.many}, numbered from 0`);
    return [picked];
  }

  /**
   * Writes a user value under .Data, such as Face.Data.Height or
   * Prices.Data.Wood, to one element, every element of a list or a Dictionary.
   *
   * @param scope Scope of the line.
   * @param write The write.
   * @param valueOf Value of each element.
   */
  private dataWrite(scope: SolidScriptScope, write: SolidScriptMemberWrite, valueOf: SolidScriptMemberValue): void {
    const name = write.key.includes('[')
      ? solidScriptValueText(solidScriptFieldResolve('value', write.key, this.fieldContext(scope))).trim()
      : write.key;
    if (!SOLID_SCRIPT_NAME.test(name))
      throw new Error(`"${name}" cannot be a Data key; keys use letters, digits and _, not starting with a digit`);
    const owner = this.fieldVariable(solidScriptNameKey(write.owner), scope);
    const items = Array.isArray(owner) ? owner : [owner];
    for (const { item, index, count } of this.memberPicked(scope, write, items))
      this.dataSetItem(item, name, valueOf(item, index, count), write.owner);
    this.persistentOwnerKeep(write.owner, scope);
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

  /**
   * Moves the corners a Position write names, each to the position the value
   * gives for it, from the geometry before the line, then applies every move
   * together.
   *
   * @param scope Scope of the line.
   * @param write The write.
   * @param valueOf New position of a corner, from its vertex, its number and
   *   how many corners there are.
   */
  private positionWrite(scope: SolidScriptScope, write: SolidScriptMemberWrite, valueOf: SolidScriptMemberValue): void {
    const picked = this.memberPicked(scope, write, this.positionTargets(scope, write));
    const moves = picked.map(({ item, index, count }) => ({
      from: item.position.clone(),
      to: solidScriptPositionValue(valueOf(item.element, index, count), item.position, write.axis),
    }));
    this.positionCommit(
      picked.map(({ item }) => item),
      moves,
    );
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
   * @param write The write.
   * @returns Corners, each with its solid or mesh and vertex element.
   */
  private positionTargets(scope: SolidScriptScope, write: SolidScriptMemberWrite): SolidScriptPositionTarget[] {
    const owner = this.fieldVariable(solidScriptNameKey(write.owner), scope);
    if (owner === undefined) throw new Error(`${write.owner} is not set`);
    const targets: SolidScriptPositionTarget[] = [];
    for (const item of Array.isArray(owner) ? owner : [owner]) this.positionTargetAdd(targets, item, write.owner);
    if (targets.length === 0) throw new Error(`${write.shown} has no vertices to set`);
    return targets;
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
}
