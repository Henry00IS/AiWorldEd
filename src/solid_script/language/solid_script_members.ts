import {
  solidScriptCornerAngles,
  solidScriptCornerPlanar,
  solidScriptCornerWarp,
  solidScriptCornerEdgeUvSplit,
  solidScriptCornerUvSplit,
} from './solid_script_members_corners.js';
import { solidScriptFaceTextureOwn } from './solid_script_shape.js';
import * as THREE from 'three';
import { solidScriptFaceIslands } from './solid_script_face_islands.js';
import { solidScriptPathHandles, solidScriptPathResolutionOf } from './solid_script_path_handles.js';
import { solidScriptPathHandleTypesOf } from './solid_script_path_handle_types.js';
import type { SolidScriptElements } from './solid_script_elements.js';
import type { SolidScriptEdgeFacts, SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptKindNamed } from './solid_script_kinds.js';
import { solidScriptVectorRead } from './solid_script_vector.js';
import { solidScriptFaceCornerUvs } from './solid_script_uvs.js';
import {
  solidScriptFaceCornerMember,
  solidScriptFaceCornersAlongEdge,
  solidScriptFaceCornersAtVertex,
  solidScriptFaceCornersOfFace,
} from './solid_script_members_face_corner.js';
import { solidScriptCurveMember } from './solid_script_curve_members.js';
import { SolidScriptCurveValue } from './solid_script_curve_value.js';
import { solidScriptNameKey } from './solid_script_name_key.js';
import { solidScriptMemberIdOf } from './solid_script_member_id.js';
import { solidScriptMemberForm } from './solid_script_shown_names.js';
import { solidScriptPathLength, solidScriptPathUps } from './solid_script_path.js';
import {
  solidScriptPathSample,
  solidScriptPathSampleNormals,
  solidScriptPathSampleTilts,
  solidScriptPathWalk,
  type SolidScriptPath,
} from './solid_script_path_model.js';
import {
  SolidScriptElement,
  SolidScriptPathElement,
  SolidScriptPoint,
  solidScriptValueNumbers,
  solidScriptValueType,
  type SolidScriptValue,
} from './solid_script_value.js';

/**
 * Members of a list of brushes, faces, edges or corners that read all of it at
 * once.
 */
const SOLID_SCRIPT_MEMBERS_BOUNDS = ['Center', 'Min', 'Max', 'Size', 'Extents'] as const;

/** Kinds whose lists also have bounds of the whole list. */
const SOLID_SCRIPT_MEMBERS_GEOMETRY = ['Object', 'Solid', 'Mesh', 'Face', 'Edge', 'Vertex'] as const;

/** Kinds of a scene object: any object, a convex solid, or a mesh. */
const SOLID_SCRIPT_MEMBERS_OBJECTS: readonly string[] = ['Object', 'Solid', 'Mesh'];

/** Members of a list of objects that keep only the solids or only the meshes. */
const SOLID_SCRIPT_MEMBERS_OBJECT_FILTERS: Readonly<Record<string, string>> = {
  Solids: 'Solid List',
  Meshes: 'Mesh List',
};

/** Official Vector axis members, in X, Y, Z order. */
export const SOLID_SCRIPT_VECTOR_AXES = ['X', 'Y', 'Z'] as const;

/** How a geometry list is named in messages, such as Vertices for a Vertex List. */
const SOLID_SCRIPT_MEMBER_LIST_WORDS: Readonly<Record<string, string>> = {
  'Object List': 'Objects',
  'Solid List': 'Solids',
  'Mesh List': 'Meshes',
  'Face List': 'Faces',
  'Edge List': 'Edges',
  'Vertex List': 'Vertices',
  'FaceCorner List': 'FaceCorners',
};

/** One declared member, with the name used through a list. */
interface SolidScriptMemberDecl {
  singular: string;
  plural: string;
  type: string;
}

const form = solidScriptMemberForm;

/**
 * Every member of every kind, each with the name used on one value and the name
 * used through a list.
 */
export const SOLID_SCRIPT_MEMBER_DECLS = {
  List: {
    Count: form('Count', 'Number'),
    First: form('First', 'Item'),
    Last: form('Last', 'Item'),
  },
  Bounds: {
    Center: form('Centers', 'Vector'),
    Min: form('Mins', 'Vector'),
    Max: form('Maxes', 'Vector'),
    Size: form('Sizes', 'Vector'),
    Extents: form('Extents', 'Vector'),
  },
  Vector: {
    X: form('Xs', 'Number'),
    Y: form('Ys', 'Number'),
    Z: form('Zs', 'Number'),
    Length: form('Lengths', 'Number'),
  },
  Text: {
    Length: form('Lengths', 'Number'),
    Words: form('Words', 'Text List'),
  },
  Path: {
    Points: form('Points', 'Vector List'),
    Closed: form('Closed', 'Yes/No'),
    Length: form('Lengths', 'Number'),
    HandlesLeft: form('HandlesLefts', 'Vector List'),
    HandlesRight: form('HandlesRights', 'Vector List'),
    Tilts: form('Tilts', 'Number List'),
    Normals: form('Normals', 'Vector List'),
    Resolution: form('Resolutions', 'Number'),
    HandleTypesLeft: form('HandleTypesLefts', 'Text List'),
    HandleTypesRight: form('HandleTypesRights', 'Text List'),
  },
  Curve: {
    Points: form('Points', 'Vector List'),
    Length: form('Lengths', 'Number'),
    Segments: form('Segments', 'Dictionary List'),
  },
  Object: {
    Name: form('Names', 'Text'),
    Faces: form('Faces', 'Face List'),
    Edges: form('Edges', 'Edge List'),
    Vertices: form('Vertices', 'Vertex List'),
    Center: form('Centers', 'Vector'),
    Min: form('Mins', 'Vector'),
    Max: form('Maxes', 'Vector'),
    Size: form('Sizes', 'Vector'),
    Extents: form('Extents', 'Vector'),
    Mode: form('Modes', 'Text'),
    Islands: form('Islands', 'List'),
    Textures: form('Textures', 'Text List'),
    Data: form('Data', 'Dictionary'),
  },
  Face: {
    Center: form('Centers', 'Vector'),
    Normal: form('Normals', 'Vector'),
    Area: form('Areas', 'Number'),
    Width: form('Widths', 'Number'),
    Height: form('Heights', 'Number'),
    Tag: form('Tags', 'Text'),
    Tags: form('Tags', 'Text List'),
    Id: form('Ids', 'Number'),
    Edges: form('Edges', 'Edge List'),
    Vertices: form('Vertices', 'Vertex List'),
    Neighbors: form('Neighbors', 'Face List'),
    Island: form('Islands', 'Number'),
    Parent: form('Parents', 'Object'),
    UVs: form('UVs', 'Vector List'),
    Angles: form('Angles', 'Number List'),
    IsPlanar: form('IsPlanar', 'Yes/No'),
    Warp: form('Warps', 'Number'),
    FaceCorners: form('FaceCorners', 'FaceCorner List'),
    Texture: form('Textures', 'Text'),
    Data: form('Data', 'Dictionary'),
  },
  Edge: {
    Start: form('Starts', 'Vector'),
    End: form('Ends', 'Vector'),
    Center: form('Centers', 'Vector'),
    Length: form('Lengths', 'Number'),
    Direction: form('Directions', 'Vector'),
    Angle: form('Angles', 'Number'),
    SignedAngle: form('SignedAngles', 'Number'),
    IsConvex: form('IsConvex', 'Yes/No'),
    IsBoundary: form('IsBoundaries', 'Yes/No'),
    IsManifold: form('IsManifold', 'Yes/No'),
    IsUVSplit: form('IsUVSplits', 'Yes/No'),
    Id: form('Ids', 'Number'),
    Faces: form('Faces', 'Face List'),
    FaceCorners: form('FaceCorners', 'FaceCorner List'),
    Parent: form('Parents', 'Object'),
    Data: form('Data', 'Dictionary'),
  },
  Vertex: {
    Position: form('Positions', 'Vector'),
    Normal: form('Normals', 'Vector'),
    Id: form('Ids', 'Number'),
    Faces: form('Faces', 'Face List'),
    Edges: form('Edges', 'Edge List'),
    IsUVSplit: form('IsUVSplits', 'Yes/No'),
    FaceCorners: form('FaceCorners', 'FaceCorner List'),
    Parent: form('Parents', 'Object'),
    Data: form('Data', 'Dictionary'),
  },
  FaceCorner: {
    Face: form('Faces', 'Face'),
    Vertex: form('Vertices', 'Vertex'),
    Index: form('Indices', 'Number'),
    Position: form('Positions', 'Vector'),
    Normal: form('Normals', 'Vector'),
    UV: form('UVs', 'Vector'),
    Angle: form('Angles', 'Number'),
    NextEdge: form('NextEdges', 'Edge'),
    PreviousEdge: form('PreviousEdges', 'Edge'),
    NextCorner: form('NextCorners', 'FaceCorner'),
    PreviousCorner: form('PreviousCorners', 'FaceCorner'),
    Ring: form('Rings', 'FaceCorner List'),
    Parent: form('Parents', 'Object'),
    Data: form('Data', 'Dictionary'),
  },
  Point: {
    Position: form('Positions', 'Vector'),
    Normal: form('Normals', 'Vector'),
    Id: form('Ids', 'Number'),
  },
} as const;

/** What each member of each kind gives on one value, by its singular name. */
export const SOLID_SCRIPT_MEMBER_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.fromEntries(
  Object.entries(SOLID_SCRIPT_MEMBER_DECLS).map(([kind, members]) => [
    kind,
    Object.fromEntries(Object.entries(members).map(([singular, decl]) => [singular, decl.type])),
  ]),
);

/** Members of each kind of value, as written on one value. */
export const SOLID_SCRIPT_MEMBERS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(SOLID_SCRIPT_MEMBER_TYPES).map(([kind, members]) => [kind, Object.keys(members)]),
);

/**
 * Finds a declared member of a kind by either of its names, in any case.
 *
 * @param kind Kind, such as Face or List.
 * @param member Name as typed.
 * @returns The declaration, or undefined when that kind has no such member.
 */

/**
 * Spells a runtime list kind the way members are declared, such as Vector List
 * for List of Vectors.
 *
 * @param type Kind from a value.
 * @returns Kind used in the member tables.
 */
function solidScriptMemberKind(type: string): string {
  if (type === 'List of Vectors') return 'Vector List';
  if (type === 'List of Text') return 'Text List';
  if (type === 'List of Numbers') return 'Number List';
  return type;
}

function solidScriptMemberDecl(kind: string, member: string): SolidScriptMemberDecl | undefined {
  if (kind === 'Mesh') {
    const key = solidScriptNameKey(member);
    if (key === 'mode' || key === 'modes') return undefined;
    return solidScriptMemberDecl('Object', member);
  }
  if (kind === 'Solid') return solidScriptMemberDecl('Object', member);
  const members = SOLID_SCRIPT_MEMBER_DECLS[kind as keyof typeof SOLID_SCRIPT_MEMBER_DECLS];
  if (!members) return undefined;
  const key = solidScriptNameKey(member);
  let plural: SolidScriptMemberDecl | undefined;
  for (const [singular, decl] of Object.entries(members)) {
    if (solidScriptNameKey(singular) === key) return { singular, plural: decl.plural, type: decl.type };
    if (solidScriptNameKey(decl.plural) === key) plural = { singular, plural: decl.plural, type: decl.type };
  }
  return plural;
}

/**
 * Tells the kind of value a member gives, such as Vector for Face.Normal or
 * Vector List for Brush.Vertices.Positions. A list of geometry also has bounds
 * of the whole list under the singular names, such as Faces.Center.
 *
 * @param type Kind of the value, such as Face or Face List.
 * @param member Member as typed, in any case.
 * @returns Kind it gives, or null when the value has no such member.
 */
export function solidScriptMemberType(type: string, member: string): string | null {
  const key = solidScriptNameKey(member);
  if ((type === 'Mesh' || type === 'Mesh List') && (key === 'mode' || key === 'modes')) return null;
  if (!type.endsWith(' List')) {
    const decl = solidScriptMemberDecl(type, member);
    return decl && solidScriptNameKey(decl.singular) === solidScriptNameKey(member) ? decl.type : null;
  }
  return solidScriptMemberTypeOfList(type.slice(0, -' List'.length), member);
}

/**
 * Tells the kind a member of a list gives: a list's own members, the bounds of
 * a geometry list, or the plural of an item member as a list of those values.
 *
 * @param item Kind of one item, such as Face.
 * @param member Member as typed.
 * @returns Kind it gives, or null when the list has no such member.
 */
function solidScriptMemberTypeOfList(item: string, member: string): string | null {
  const key = solidScriptNameKey(member);
  const listed = solidScriptMemberDecl('List', member);
  if (listed && solidScriptNameKey(listed.singular) === key) return listed.type === 'Item' ? item : listed.type;
  if (SOLID_SCRIPT_MEMBERS_GEOMETRY.includes(item as (typeof SOLID_SCRIPT_MEMBERS_GEOMETRY)[number])) {
    const bounds = solidScriptMemberDecl('Bounds', member);
    if (bounds && solidScriptNameKey(bounds.singular) === key) return bounds.type;
  }
  const filter = solidScriptMemberObjectFilter(item, member);
  if (filter) return filter;
  const decl = solidScriptMemberDecl(item, member);
  if (!decl || solidScriptNameKey(decl.plural) !== key) return null;
  return decl.type === 'List' || decl.type.endsWith(' List') ? decl.type : `${decl.type} List`;
}

/**
 * Lists the members of a kind of value: singular names on one value, and on a
 * list its own members, bounds, and the plural names of its items.
 *
 * @param type Kind, such as Face List.
 * @returns Members as written.
 */
export function solidScriptMemberNames(type: string): string[] {
  const listed = type.endsWith(' List');
  const item = listed ? type.slice(0, -' List'.length) : type;
  const names = listed
    ? [
        ...Object.keys(SOLID_SCRIPT_MEMBER_DECLS.List),
        ...(SOLID_SCRIPT_MEMBERS_GEOMETRY.includes(item as (typeof SOLID_SCRIPT_MEMBERS_GEOMETRY)[number])
          ? Object.keys(SOLID_SCRIPT_MEMBER_DECLS.Bounds)
          : []),
        ...(SOLID_SCRIPT_MEMBERS_OBJECTS.includes(item) ? Object.keys(SOLID_SCRIPT_MEMBERS_OBJECT_FILTERS) : []),
        ...Object.values(SOLID_SCRIPT_MEMBER_DECLS[solidScriptMemberDeclared(item)] ?? {}).map((decl) => decl.plural),
      ]
    : Object.keys(SOLID_SCRIPT_MEMBER_DECLS[solidScriptMemberDeclared(item)] ?? {});
  return [...new Set(names)].filter((name) => solidScriptMemberType(type, name) !== null);
}

/**
 * Names the member table of a kind: a solid and a mesh read the members of an
 * object.
 *
 * @param kind Kind of one item, such as Mesh.
 * @returns Key of SOLID_SCRIPT_MEMBER_DECLS.
 */
function solidScriptMemberDeclared(kind: string): keyof typeof SOLID_SCRIPT_MEMBER_DECLS {
  return (SOLID_SCRIPT_MEMBERS_OBJECTS.includes(kind) ? 'Object' : kind) as keyof typeof SOLID_SCRIPT_MEMBER_DECLS;
}

/**
 * Tells the kind a Solids or Meshes member gives on a list of objects.
 *
 * @param item Kind of one item, such as Object.
 * @param member Member as typed.
 * @returns Solid List or Mesh List, or undefined for another member or kind.
 */
function solidScriptMemberObjectFilter(item: string, member: string): string | undefined {
  if (!SOLID_SCRIPT_MEMBERS_OBJECTS.includes(item)) return undefined;
  const key = solidScriptNameKey(member);
  const found = Object.entries(SOLID_SCRIPT_MEMBERS_OBJECT_FILTERS).find(([name]) => solidScriptNameKey(name) === key);
  return found?.[1];
}

/**
 * Suggests the other form of a member when the written name belongs to the
 * other number, such as Position on a Vertex List.
 *
 * @param type Kind of the value, such as Vertex List.
 * @param member Member as typed.
 * @returns A Did-you-mean hint, or undefined when the name is not the other
 *   form.
 */
export function solidScriptMemberHint(type: string, member: string): string | undefined {
  const key = solidScriptNameKey(member);
  if (type.endsWith(' List')) {
    const decl = solidScriptMemberDecl(type.slice(0, -' List'.length), member);
    if (decl && decl.singular !== decl.plural && solidScriptNameKey(decl.singular) === key) {
      const list = SOLID_SCRIPT_MEMBER_LIST_WORDS[type] ?? 'This';
      return `Did you mean ${decl.plural}? ${list} is a list`;
    }
    return undefined;
  }
  const decl = solidScriptMemberDecl(type, member);
  if (decl && decl.singular !== decl.plural && solidScriptNameKey(decl.plural) === key)
    return `Did you mean ${decl.singular}?`;
  return undefined;
}

/**
 * Rounds a number so small errors do not show, such as 0.30000000000000004.
 *
 * @param value Number.
 * @returns Rounded number.
 */
export function solidScriptMemberRound(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/**
 * Writes a vector as a value.
 *
 * @param vector Vector.
 * @returns Three numbers.
 */
export function solidScriptMemberVector(vector: THREE.Vector3): SolidScriptValue {
  return vector.toArray().map(solidScriptMemberRound);
}

/** Members that give where each kind of item is, for its Id. */
const SOLID_SCRIPT_MEMBER_ID_PLACES: Readonly<Record<string, readonly string[]>> = {
  face: ['center', 'normal'],
  edge: ['center'],
  vertex: ['position'],
};

/**
 * Reads the Id of a face, edge, corner or point: a whole number worked out from
 * where it is, so it stays when other items are deleted or reordered.
 *
 * @param value Value the Id is read from.
 * @param elements Geometry values of the run.
 * @returns Id, or undefined when the value has none.
 */
function solidScriptMemberId(value: SolidScriptValue, elements: SolidScriptElements): number | undefined {
  if (value instanceof SolidScriptPoint) return solidScriptMemberIdOf(value.position);
  if (!(value instanceof SolidScriptElement)) return undefined;
  const places = SOLID_SCRIPT_MEMBER_ID_PLACES[value.kind];
  if (!places) return undefined;
  return solidScriptMemberIdOf(
    places.flatMap((place) => solidScriptValueNumbers(solidScriptMemberElement(value, place, elements)) ?? []),
  );
}

/**
 * Reads a member of a value, such as .Count of a list, .Center of a face or a
 * key under .Data; a Dictionary reads its keys directly or under its own
 * .Data.
 *
 * @param value Value the member is read from.
 * @param member Member name, folded to lower case.
 * @param elements Geometry values of the run.
 * @param written Member as written, for messages and Data keys.
 * @returns Value.
 */
export function solidScriptMemberRead(
  value: SolidScriptValue,
  member: string,
  elements: SolidScriptElements,
  written = member,
): SolidScriptValue {
  const key = solidScriptNameKey(member);
  if (key === 'id') {
    const id = solidScriptMemberId(value, elements);
    if (id !== undefined) return id;
  }
  if (value instanceof SolidScriptPoint) {
    if (key === 'position') return value.position;
    if (key === 'normal') return value.normal;
  } else if (value instanceof SolidScriptElement) {
    if (value.kind === 'data') return key === 'data' ? value : elements.dataRead(value, member);
    const read = solidScriptMemberElement(value, key, elements);
    if (read !== undefined) return read;
  } else if (Array.isArray(value)) {
    const read = solidScriptMemberList(value, key, elements, written);
    if (read !== undefined) return read;
  } else if (typeof value === 'string') {
    if (key === 'length') return value.length;
    if (key === 'words') return value.split(/\s+/).filter((word) => word !== '');
  }
  const type = solidScriptMemberKind(solidScriptValueType(value));
  const named = solidScriptKindNamed(value);
  const hint = solidScriptMemberHint(type, written);
  if (hint) throw new Error(`${named} has no .${written}. ${hint}`);
  const known = solidScriptMemberNames(type.startsWith('List') ? 'List' : type);
  throw new Error(
    known.length === 0
      ? `${named} has no .${written}; numbers and Yes/No values have no members`
      : `${named} has no .${written}; it has ${known.map((name) => `.${name}`).join(', ')}`,
  );
}

/**
 * Reads a member of a list.
 *
 * @param list List.
 * @param member Member, folded.
 * @param elements Geometry values of the run.
 * @param written Member as written.
 * @returns Value, or undefined when lists have no such member.
 */
function solidScriptMemberList(
  list: readonly SolidScriptValue[],
  member: string,
  elements: SolidScriptElements,
  written: string,
): SolidScriptValue {
  const key = solidScriptNameKey(member);
  switch (key) {
    case 'count':
      return list.length;
    case 'solids':
    case 'meshes':
      if (list.every((item) => item instanceof SolidScriptElement && item.kind === 'brush'))
        return list.filter((item) => (item as SolidScriptElement).mesh === (key === 'meshes'));
      break;
    case 'first':
    case 'last':
      if (list.length === 0) throw new Error(`the list is empty, so it has no .${written}; check its .Count first`);
      return key === 'first' ? list[0] : list[list.length - 1];
  }
  const numbers = solidScriptVectorRead([...list]);
  if (numbers) {
    const axis = SOLID_SCRIPT_VECTOR_AXES.findIndex((name) => solidScriptNameKey(name) === key);
    if (axis >= 0) return numbers[axis];
    if (key === 'length') return solidScriptMemberRound(Math.hypot(...numbers));
  }
  const geometry = list.length > 0 && list.every((item) => item instanceof SolidScriptElement && item.kind !== 'data');
  if (geometry && SOLID_SCRIPT_MEMBERS_BOUNDS.some((name) => solidScriptNameKey(name) === key))
    return solidScriptMemberBounds(elements.bounds(list as SolidScriptElement[]), key);
  if (list.length === 0) return [];
  const itemType = solidScriptMemberKind(solidScriptValueType(list[0]));
  if (itemType === 'Dictionary') return list.map((item) => solidScriptMemberRead(item, member, elements, written));
  const decl = itemType ? solidScriptMemberDecl(itemType, member) : undefined;
  if (!decl || solidScriptNameKey(decl.plural) !== key) return undefined;
  if (!list.every((item) => item instanceof SolidScriptElement)) {
    return list.map((item) => solidScriptMemberRead(item, decl.singular, elements, written));
  }
  const read = list.map((item) => solidScriptMemberRead(item, decl.singular, elements, written));
  if (!read.every((item) => Array.isArray(item) && item.every((inner) => inner instanceof SolidScriptElement)))
    return read;
  const joined: SolidScriptValue[] = [];
  for (const item of read.flat()) if (!joined.includes(item)) joined.push(item);
  return joined;
}

/**
 * Reads a bounds member of a box.
 *
 * @param bounds Box around the points.
 * @param member Center, Min, Max, Size or Extents, folded.
 * @returns Vector.
 */
function solidScriptMemberBounds(bounds: THREE.Box3, member: string): SolidScriptValue {
  switch (solidScriptNameKey(member)) {
    case 'center':
      return solidScriptMemberVector(bounds.getCenter(new THREE.Vector3()));
    case 'min':
      return solidScriptMemberVector(bounds.min);
    case 'max':
      return solidScriptMemberVector(bounds.max);
    case 'size':
      return solidScriptMemberVector(bounds.getSize(new THREE.Vector3()));
    default:
      return solidScriptMemberVector(bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5));
  }
}

/**
 * Gives the way a path's up side faces at every point it passes: its stored
 * normal, or the least-turning one when none is stored.
 *
 * @param path Path.
 * @returns Unit vector per sampled point.
 */
function solidScriptMemberPathNormals(path: SolidScriptPath<number[]>): SolidScriptValue {
  const vector = ([x = 0, y = 0, z = 0]: readonly number[]): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const points = solidScriptPathSample(path).map(vector);
  const stored = solidScriptPathSampleNormals(path)?.map(vector);
  return solidScriptPathUps(points, path.closed, stored).map(solidScriptMemberVector);
}

/**
 * Reads a member of a path.
 *
 * @param path Path.
 * @param member Member, folded.
 * @returns Value, or undefined when it has no such member.
 */
function solidScriptMemberPath(path: SolidScriptPath<number[]>, member: string): SolidScriptValue {
  if (member === 'points') return solidScriptPathSample(path).map((point) => point.map(solidScriptMemberRound));
  if (member === 'closed') return path.closed;
  if (member === 'tilts') return solidScriptPathSampleTilts(path).map(solidScriptMemberRound);
  if (member === 'normals') return solidScriptMemberPathNormals(path);
  if (member === 'length') return solidScriptMemberRound(solidScriptPathLength(solidScriptPathWalk(path)));
  if (member === 'resolution') return solidScriptPathResolutionOf(path);
  if (member === 'handletypesleft') return [...solidScriptPathHandleTypesOf(path).left];
  if (member === 'handletypesright') return [...solidScriptPathHandleTypesOf(path).right];
  if (member === 'handlesleft' || member === 'handlesright')
    return solidScriptPathHandles(path)[member === 'handlesleft' ? 'left' : 'right'].map((point) =>
      point.map(solidScriptMemberRound),
    );
  return undefined;
}

/**
 * Reads a member of a brush, face, edge or corner.
 *
 * @param element Element.
 * @param member Member, folded.
 * @param elements Geometry values of the run.
 * @returns Value, or undefined when it has no such member.
 */
function solidScriptMemberElement(
  element: SolidScriptElement,
  member: string,
  elements: SolidScriptElements,
): SolidScriptValue {
  if (member === 'data') return elements.data(element);
  if (element instanceof SolidScriptPathElement) return solidScriptMemberPath(element.path, member);
  if (element instanceof SolidScriptCurveValue) return solidScriptCurveMember(element.curve, member);
  if (member === 'parent' && element.kind !== 'brush') return elements.parent(element);
  const leaf = elements.leaf(element);
  const faceList = (faces: readonly SolidScriptFaceFacts[]): SolidScriptValue[] => {
    const found: SolidScriptValue[] = [];
    for (const face of faces) {
      const made = elements.face(face);
      if (!found.includes(made)) found.push(made);
    }
    return found;
  };
  const edgeList = (): SolidScriptValue[] => {
    const found: SolidScriptValue[] = [];
    for (const edge of elements.edges(element)) {
      const made = elements.edge(edge);
      if (!found.includes(made)) found.push(made);
    }
    return found;
  };
  const vertexList = (): SolidScriptValue[] =>
    elements.vertices(element).map((vertex) => elements.vertex(leaf, vertex));
  switch (element.kind) {
    case 'brush':
      if (member === 'name') return leaf.label;
      if (member === 'textures')
        return [...new Set(elements.faces(element).map(solidScriptMemberTexture))].filter((name) => name !== '');
      if (member === 'mode') return elements.modeEffective(leaf);
      if (member === 'faces') return faceList(elements.faces(element));
      if (member === 'edges') return edgeList();
      if (member === 'vertices') return vertexList();
      if (member === 'islands') return solidScriptMemberIslands(element, elements).map(faceList);
      if (SOLID_SCRIPT_MEMBERS_BOUNDS.some((name) => solidScriptNameKey(name) === solidScriptNameKey(member)))
        return solidScriptMemberBounds(elements.bounds([element]), member);
      return undefined;
    case 'face':
      if (member === 'neighbors')
        return faceList(elements.edges(element).flatMap((edge) => edge.faces.filter((face) => face !== null))).filter(
          (face) => face !== element,
        );
      if (member === 'island') return solidScriptMemberIsland(element, elements);
      return solidScriptMemberFace(element, member, elements, edgeList, vertexList);
    case 'edge': {
      const edges = elements.edges(element);
      if (edges.length === 0) throw new Error(`${String(element)} was cut away`);
      if (member === 'faces') return faceList(edges.flatMap((edge) => edge.faces.filter((face) => face !== null)));
      if (member === 'angle') return solidScriptMemberRound(Math.max(...edges.map(solidScriptMemberEdgeAngle)));
      if (member === 'signedangle') return solidScriptMemberRound(solidScriptMemberEdgeSigned(edges));
      if (member === 'isconvex') return solidScriptMemberEdgeSigned(edges) > SOLID_SCRIPT_MEMBER_FLAT;
      if (member === 'isboundary') return leaf.kind === 'mesh' && edges.some((edge) => edge.faces[1] === null);
      if (member === 'ismanifold')
        return faceList(edges.flatMap((edge) => edge.faces.filter((face) => face !== null))).length === 2;
      if (member === 'isuvsplit') return edges.some(solidScriptCornerEdgeUvSplit);
      if (member === 'facecorners') return solidScriptFaceCornersAlongEdge(elements, edges);
      return solidScriptMemberEdge(edges, member);
    }
    case 'vertex': {
      const [vertex] = elements.vertices(element);
      if (!vertex) throw new Error(`${String(element)} was cut away`);
      if (member === 'position') return solidScriptMemberVector(vertex.position);
      if (member === 'normal') return solidScriptMemberVector(vertex.normal);
      const at = (point: THREE.Vector3): boolean => point.distanceTo(vertex.position) < 1e-6;
      const brush = elements.parent(element);
      if (member === 'faces') return faceList(elements.faces(brush).filter((face) => face.corners.some(at)));
      if (member === 'isuvsplit') return solidScriptCornerUvSplit(elements.faces(brush), vertex.position);
      if (member === 'facecorners')
        return solidScriptFaceCornersAtVertex(elements, elements.faces(brush), vertex.position);
      if (member === 'edges') {
        const found: SolidScriptValue[] = [];
        for (const edge of elements.edges(brush))
          if (at(edge.start) || at(edge.end)) {
            const made = elements.edge(edge);
            if (!found.includes(made)) found.push(made);
          }
        return found;
      }
      return undefined;
    }
    case 'facecorner': {
      const value = solidScriptFaceCornerMember(element, member, elements);
      if (value instanceof THREE.Vector3) return solidScriptMemberVector(value);
      return typeof value === 'number' ? solidScriptMemberRound(value) : value;
    }
    default:
      return undefined;
  }
}

/**
 * Angle in degrees between the two faces meeting at an edge piece; 0 when only
 * one face uses it.
 *
 * @param edge Edge piece.
 * @returns Degrees from 0 (flat) to 180.
 */
function solidScriptMemberEdgeAngle(edge: SolidScriptEdgeFacts): number {
  const [first, second] = edge.faces;
  if (!second) return 0;
  return THREE.MathUtils.radToDeg(first.normal.angleTo(second.normal));
}

/**
 * Degrees below which the faces at an edge count as flat, neither outer nor
 * inner corner.
 */
const SOLID_SCRIPT_MEMBER_FLAT = 0.001;

/**
 * Signed angle of an edge: its Angle, positive on an outer (convex) corner such
 * as every edge of a cube, negative on an inner (concave) one; 0 when flat or
 * when one face uses it. Of an edge cut in pieces, the sharpest piece.
 *
 * @param edges Pieces of the edge.
 * @returns Degrees from -180 to 180.
 */
function solidScriptMemberEdgeSigned(edges: readonly SolidScriptEdgeFacts[]): number {
  const signed = edges.map((edge) => {
    const [first, second] = edge.faces;
    if (!second) return 0;
    const behind = second.center.clone().sub(first.center).dot(first.normal) < 0;
    return solidScriptMemberEdgeAngle(edge) * (behind ? 1 : -1);
  });
  return signed.reduce((sharpest, angle) => (Math.abs(angle) > Math.abs(sharpest) ? angle : sharpest), 0);
}

/**
 * Texture the face will be painted with: the last Texture Faces on its plane
 * wins over its object's Texture; empty means the generator's texture. The
 * plane test matches the one used when the output paints faces.
 *
 * @param face Face to read.
 * @returns Library texture name, or empty for the generator's texture.
 */
function solidScriptMemberTexture(face: SolidScriptFaceFacts): string {
  return solidScriptFaceTextureOwn(face.leaf.faceTextures ?? [], face.normal, face.center) ?? face.leaf.texture ?? '';
}

/**
 * Splits the faces of a brush or mesh into islands: groups joined through
 * shared edges, in the order their first face was built.
 *
 * @param element Brush or mesh.
 * @param elements Geometry values of the run.
 * @returns Faces of each island.
 */
function solidScriptMemberIslands(
  element: SolidScriptElement,
  elements: SolidScriptElements,
): SolidScriptFaceFacts[][] {
  return solidScriptFaceIslands(elements.faces(element), elements.edges(element), () => true);
}

/**
 * Finds which island of its object a face is in: the number of that island in
 * [Object.Islands], from 0.
 *
 * @param element Face element.
 * @param elements Geometry values of the run.
 * @returns Island number.
 */
function solidScriptMemberIsland(element: SolidScriptElement, elements: SolidScriptElements): number {
  const first = elements.faces(element)[0];
  if (!first) throw new Error(`${String(element)} was cut away`);
  const islands = solidScriptMemberIslands(elements.brush(first.leaf), elements);
  return islands.findIndex((island) => island.some((face) => face.index === first.index));
}

/**
 * Reads a member of a face; a face split into pieces reads them all together.
 *
 * @param element Face element.
 * @param member Member, folded.
 * @param elements Geometry values of the run.
 * @param edgeList Its edges as elements.
 * @param vertexList Its corners as elements.
 * @returns Value, or undefined when faces have no such member.
 */
function solidScriptMemberFace(
  element: SolidScriptElement,
  member: string,
  elements: SolidScriptElements,
  edgeList: () => SolidScriptValue[],
  vertexList: () => SolidScriptValue[],
): SolidScriptValue {
  const pieces = elements.faces(element);
  if (pieces.length === 0) throw new Error(`${String(element)} was cut away`);
  const first = pieces[0]!;
  const area = pieces.reduce((sum, face) => sum + face.area, 0);
  switch (member) {
    case 'texture':
      return solidScriptMemberTexture(first);
    case 'center': {
      const center = new THREE.Vector3();
      for (const face of pieces) center.addScaledVector(face.center, area > 0 ? face.area / area : 1 / pieces.length);
      return solidScriptMemberVector(center);
    }
    case 'normal':
      return solidScriptMemberVector(first.normal);
    case 'area':
      return solidScriptMemberRound(area);
    case 'width':
      return solidScriptMemberRound(solidScriptMemberFaceSpan(pieces, first.across, first.width));
    case 'height':
      return solidScriptMemberRound(solidScriptMemberFaceSpan(pieces, first.up, first.height));
    case 'tag':
      return first.tags.at(-1) ?? '';
    case 'tags':
      return [...new Set(pieces.flatMap((face) => face.tags))];
    case 'edges':
      return edgeList();
    case 'vertices':
      return vertexList();
    case 'angles':
      return solidScriptCornerAngles(first).map(solidScriptMemberRound);
    case 'isplanar':
      return solidScriptCornerPlanar(pieces);
    case 'warp':
      return solidScriptMemberRound(solidScriptCornerWarp(pieces));
    case 'facecorners':
      return solidScriptFaceCornersOfFace(elements, first);
    case 'uvs':
      return solidScriptFaceCornerUvs(first).map(([u, v]) => [solidScriptMemberRound(u), solidScriptMemberRound(v), 0]);
    default:
      return undefined;
  }
}

/**
 * Reads an edge member from kept facts: one piece uses them as they are;
 * several colinear pieces use the ends of the whole line.
 *
 * @param edges Matching pieces, at least one.
 * @param member Start, End, Center, Length or Direction, folded.
 * @returns Value, or undefined when edges have no such member.
 */
function solidScriptMemberEdge(edges: readonly SolidScriptEdgeFacts[], member: string): SolidScriptValue {
  if (edges.length === 1) return solidScriptMemberEdgeFact(edges[0]!, member);
  const first = edges[0]!;
  const ends = edges.flatMap((edge) => [edge.start, edge.end]);
  const along = ends.map((point) => point.dot(first.direction));
  const start = ends[along.indexOf(Math.min(...along))]!;
  const end = ends[along.indexOf(Math.max(...along))]!;
  return solidScriptMemberEdgeSpan(member, start, end, first.direction);
}

/**
 * Reads an edge member from one kept piece.
 *
 * @param edge Piece.
 * @param member Member, folded.
 * @returns Value, or undefined when edges have no such member.
 */
function solidScriptMemberEdgeFact(edge: SolidScriptEdgeFacts, member: string): SolidScriptValue {
  return solidScriptMemberEdgeSpan(member, edge.start, edge.end, edge.direction, edge.center, edge.length);
}

/**
 * Writes a start, end, center, length or direction value.
 *
 * @param member Member, folded.
 * @param start Start point.
 * @param end End point.
 * @param direction Unit direction from start to end.
 * @param center Midpoint, when already known.
 * @param length Length, when already known.
 * @returns Value, or undefined when edges have no such member.
 */
function solidScriptMemberEdgeSpan(
  member: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  direction: THREE.Vector3,
  center?: THREE.Vector3,
  length?: number,
): SolidScriptValue {
  switch (member) {
    case 'start':
      return solidScriptMemberVector(start);
    case 'end':
      return solidScriptMemberVector(end);
    case 'center':
      return solidScriptMemberVector(center ?? start.clone().add(end).multiplyScalar(0.5));
    case 'length':
      return solidScriptMemberRound(length ?? start.distanceTo(end));
    case 'direction':
      return solidScriptMemberVector(direction);
    default:
      return undefined;
  }
}

/**
 * Width or height of a face: the kept size of a single piece, or the span of
 * every piece along that axis.
 *
 * @param pieces Face pieces, at least one.
 * @param axis Across or up of the first piece.
 * @param kept Width or height of the first piece.
 * @returns Size.
 */
function solidScriptMemberFaceSpan(pieces: readonly SolidScriptFaceFacts[], axis: THREE.Vector3, kept: number): number {
  if (pieces.length === 1) return kept;
  const along = pieces.flatMap((face) => face.corners.map((corner) => corner.dot(axis)));
  return Math.max(...along) - Math.min(...along);
}
