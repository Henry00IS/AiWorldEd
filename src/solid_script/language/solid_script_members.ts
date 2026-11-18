import * as THREE from 'three';
import type { SolidScriptElements } from './solid_script_elements.js';
import type { SolidScriptFaceFacts } from './solid_script_geometry.js';
import { solidScriptKindNamed } from './solid_script_kinds.js';
import { solidScriptFaceCornerUvs } from './solid_script_uvs.js';
import {
  SolidScriptElement,
  solidScriptValueNumbers,
  solidScriptValueType,
  type SolidScriptValue,
} from './solid_script_value.js';

/**
 * Members of a list of brushes, faces, edges or corners that read all of it at
 * once.
 */
const SOLID_SCRIPT_MEMBERS_BOUNDS = ['Center', 'Min', 'Max', 'Size', 'Extents'];

/**
 * What each member of each kind of value gives, by kind; lists also have the
 * members of their items.
 */
export const SOLID_SCRIPT_MEMBER_TYPES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  List: { Count: 'Number', First: 'Item', Last: 'Item' },
  Bounds: { Center: 'Vector', Min: 'Vector', Max: 'Vector', Size: 'Vector', Extents: 'Vector' },
  Vector: { x: 'Number', y: 'Number', z: 'Number', Length: 'Number' },
  Text: { Length: 'Number', Words: 'Text List' },
  Brush: {
    Name: 'Text',
    Faces: 'Face List',
    Edges: 'Edge List',
    Vertices: 'Vertex List',
    Center: 'Vector',
    Min: 'Vector',
    Max: 'Vector',
    Size: 'Vector',
    Extents: 'Vector',
    Data: 'Data',
  },
  Face: {
    Center: 'Vector',
    Normal: 'Vector',
    Area: 'Number',
    Width: 'Number',
    Height: 'Number',
    Tag: 'Text',
    Tags: 'Text List',
    Edges: 'Edge List',
    Vertices: 'Vertex List',
    Parent: 'Brush',
    UVs: 'Vector List',
    Data: 'Data',
  },
  Edge: {
    Start: 'Vector',
    End: 'Vector',
    Middle: 'Vector',
    Length: 'Number',
    Direction: 'Vector',
    Faces: 'Face List',
    Parent: 'Brush',
    Data: 'Data',
  },
  Vertex: { Position: 'Vector', Normal: 'Vector', Parent: 'Brush', Data: 'Data' },
};

/** Members of each kind of value, as written in messages and suggestions. */
export const SOLID_SCRIPT_MEMBERS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(SOLID_SCRIPT_MEMBER_TYPES).map(([kind, members]) => [kind, Object.keys(members)]),
);

/**
 * Tells the kind of value a member gives, such as Vector for Face.Normal or
 * Face List for Brush.Faces. A member of a list of brushes, faces, edges or
 * corners reads its bounds or the member of every item.
 *
 * @param type Kind of the value, such as Face or Face List.
 * @param member Member as typed, in any case.
 * @returns Kind it gives, or null when the value has no such member.
 */
export function solidScriptMemberType(type: string, member: string): string | null {
  const find = (members: Readonly<Record<string, string>> | undefined): string | undefined =>
    Object.entries(members ?? {}).find(([name]) => name.toLowerCase() === member.toLowerCase())?.[1];
  if (!type.endsWith(' List')) return find(SOLID_SCRIPT_MEMBER_TYPES[type]) ?? null;
  const item = type.slice(0, -' List'.length);
  const listed = find(SOLID_SCRIPT_MEMBER_TYPES['List']);
  if (listed) return listed === 'Item' ? item : listed;
  if (!(item in SOLID_SCRIPT_MEMBER_TYPES) || ['Vector', 'Text'].includes(item)) return null;
  const bounds = find(SOLID_SCRIPT_MEMBER_TYPES['Bounds']);
  if (bounds) return bounds;
  const each = find(SOLID_SCRIPT_MEMBER_TYPES[item]);
  if (!each) return null;
  return each.endsWith(' List') ? each : `${each} List`;
}

/**
 * Lists the members of a kind of value, lists with those of their items.
 *
 * @param type Kind, such as Face List.
 * @returns Members as written.
 */
export function solidScriptMemberNames(type: string): string[] {
  const names = type.endsWith(' List')
    ? [
        ...Object.keys(SOLID_SCRIPT_MEMBER_TYPES['List']!),
        ...Object.keys(SOLID_SCRIPT_MEMBER_TYPES['Bounds']!),
        ...Object.keys(SOLID_SCRIPT_MEMBER_TYPES[type.slice(0, -' List'.length)] ?? {}),
      ]
    : Object.keys(SOLID_SCRIPT_MEMBER_TYPES[type] ?? {});
  return [...new Set(names)].filter((name) => solidScriptMemberType(type, name) !== null);
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

/**
 * Reads a member of a value, such as .Count of a list, .Center of a face or a
 * key under .Data.
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
  if (value instanceof SolidScriptElement) {
    if (value.kind === 'data') return elements.dataRead(value, member);
    const read = solidScriptMemberElement(value, member, elements);
    if (read !== undefined) return read;
  } else if (Array.isArray(value)) {
    const read = solidScriptMemberList(value, member, elements, written);
    if (read !== undefined) return read;
  } else if (typeof value === 'string') {
    if (member === 'length') return value.length;
    if (member === 'words') return value.split(/\s+/).filter((word) => word !== '');
  }
  const type = solidScriptValueType(value);
  // The same members the editor suggests after the dot.
  const known = solidScriptMemberNames(type.startsWith('List') ? 'List' : type);
  const named = solidScriptKindNamed(value);
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
  switch (member) {
    case 'count':
      return list.length;
    case 'first':
    case 'last':
      if (list.length === 0) throw new Error(`the list is empty, so it has no .${written}; check its .Length first`);
      return member === 'first' ? list[0] : list[list.length - 1];
  }
  const numbers = solidScriptValueNumbers([...list]);
  if (numbers && numbers.length === 3) {
    const axis = 'xyz'.indexOf(member);
    if (axis >= 0 && member.length === 1) return numbers[axis];
    if (member === 'length') return solidScriptMemberRound(Math.hypot(...numbers));
  }
  const geometry = list.length > 0 && list.every((item) => item instanceof SolidScriptElement && item.kind !== 'data');
  if (geometry && SOLID_SCRIPT_MEMBERS_BOUNDS.some((name) => name.toLowerCase() === member))
    return solidScriptMemberBounds(elements.bounds(list as SolidScriptElement[]), member);
  if (!list.every((item) => item instanceof SolidScriptElement)) return undefined;
  // Any other member is read from every item, such as [Sides.Data.Height] or [Top.Edges].
  const read = list.map((item) => solidScriptMemberRead(item, member, elements, written));
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
  switch (member) {
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
      if (member === 'faces') return faceList(elements.faces(element));
      if (member === 'edges') return edgeList();
      if (member === 'vertices') return vertexList();
      if (SOLID_SCRIPT_MEMBERS_BOUNDS.some((name) => name.toLowerCase() === member))
        return solidScriptMemberBounds(elements.bounds([element]), member);
      return undefined;
    case 'face':
      return solidScriptMemberFace(element, member, elements, edgeList, vertexList);
    case 'edge': {
      const edges = elements.edges(element);
      if (edges.length === 0) throw new Error(`${String(element)} was cut away`);
      const ends = edges.flatMap((edge) => [edge.start, edge.end]);
      const direction = edges[0]!.direction;
      const along = ends.map((point) => point.dot(direction));
      const start = ends[along.indexOf(Math.min(...along))]!;
      const end = ends[along.indexOf(Math.max(...along))]!;
      switch (member) {
        case 'start':
          return solidScriptMemberVector(start);
        case 'end':
          return solidScriptMemberVector(end);
        case 'middle':
          return solidScriptMemberVector(start.clone().add(end).multiplyScalar(0.5));
        case 'length':
          return solidScriptMemberRound(start.distanceTo(end));
        case 'direction':
          return solidScriptMemberVector(direction);
        case 'faces':
          return faceList(edges.flatMap((edge) => edge.faces.filter((face) => face !== null)));
        default:
          return undefined;
      }
    }
    case 'vertex': {
      const [vertex] = elements.vertices(element);
      if (!vertex) throw new Error(`${String(element)} was cut away`);
      if (member === 'position') return solidScriptMemberVector(vertex.position);
      if (member === 'normal') return solidScriptMemberVector(vertex.normal);
      return undefined;
    }
    default:
      return undefined;
  }
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
  const span = (axis: THREE.Vector3): number => {
    const along = pieces.flatMap((face) => face.corners.map((corner) => corner.dot(axis)));
    return Math.max(...along) - Math.min(...along);
  };
  switch (member) {
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
      return solidScriptMemberRound(span(first.across));
    case 'height':
      return solidScriptMemberRound(span(first.up));
    case 'tag':
      return first.tags.at(-1) ?? '';
    case 'tags':
      return [...new Set(pieces.flatMap((face) => face.tags))];
    case 'edges':
      return edgeList();
    case 'vertices':
      return vertexList();
    case 'uvs':
      return solidScriptFaceCornerUvs(first).map(([u, v]) => [solidScriptMemberRound(u), solidScriptMemberRound(v), 0]);
    default:
      return undefined;
  }
}
