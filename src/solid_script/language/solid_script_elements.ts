import * as THREE from 'three';
import {
  solidScriptGeometryEdges,
  solidScriptGeometryEdgesAlong,
  solidScriptGeometryFaceHolds,
  solidScriptGeometryFaces,
  solidScriptGeometryVertices,
  solidScriptGeometryVerticesAt,
  type SolidScriptEdgeFacts,
  type SolidScriptFaceFacts,
  type SolidScriptGeometryLeaf,
  type SolidScriptVertexFacts,
} from './solid_script_geometry.js';
import { solidScriptGeometryLeafMatrix } from './solid_script_geometry_matrix.js';
import { SOLID_SCRIPT_MODE_DEFAULT, type SolidScriptMode } from './solid_script_mode.js';
import {
  SolidScriptDictionary,
  SolidScriptElement,
  type SolidScriptDictionaryEntry,
  type SolidScriptElementKind,
  type SolidScriptValue,
} from './solid_script_value.js';

/** A plane a face lies on, with the outline the face had when its id was made. */
interface SolidScriptElementPlane {
  normal: THREE.Vector3;
  /** Corners of the face when the id was made; pieces inside it are the face. */
  corners: THREE.Vector3[];
}

/** What an element id stands for. */
interface SolidScriptElementEntry {
  element: SolidScriptElement;
  /**
   * The solid or mesh as it was when the id was made; read through the run's
   * latest.
   */
  leaf: SolidScriptGeometryLeaf;
  /** Face: its plane and outline. */
  plane?: SolidScriptElementPlane;
  /** Edge: the planes of its two faces. */
  planes?: [SolidScriptElementPlane, SolidScriptElementPlane | null];
  /** Vertex: where it was. Edge: a point on its line. */
  position?: THREE.Vector3;
  /** Edge: unit direction along its line. */
  direction?: THREE.Vector3;
  /** Face corner: the face it belongs to. */
  owner?: SolidScriptElement;
  /** Face: its number on the solid or mesh when the id was made. */
  faceIndex?: number;
  /** The user's own values, by key. */
  data: Map<string, SolidScriptDictionaryEntry>;
  /** The Data value of the element, made on first read. */
  dataElement?: SolidScriptDictionary;
}

/** How the elements of a run find the latest version of a solid or mesh. */
export interface SolidScriptElementsHost {
  /**
   * Returns the latest version of a solid or mesh after later changes.
   *
   * @param leaf Solid or mesh as an element saw it.
   * @returns Latest version.
   */
  leafLatest(leaf: SolidScriptGeometryLeaf): SolidScriptGeometryLeaf;
}

/** Held faces of one solid or mesh. */
interface SolidScriptElementFaces {
  /** Face ids by the face number they were made from. */
  byIndex: Map<number, SolidScriptElementEntry>;
  /** Every face already held on this solid or mesh. */
  list: SolidScriptElementEntry[];
}

/** How close two directions must be to count as the same, as a dot product. */
const SOLID_SCRIPT_ELEMENTS_SAME = 0.9999;

/**
 * Keeps the geometry values of one run: every brush, face, edge and corner a
 * script holds is an id here, read again from the latest geometry whenever it
 * is used, with the user's .Data values beside it.
 */
export class SolidScriptElements {
  private readonly entries: SolidScriptElementEntry[] = [];
  private readonly brushes = new Map<SolidScriptGeometryLeaf, SolidScriptElement>();
  /**
   * Bounds already read, by the ids of the elements, with the brushes they were
   * read from.
   */
  private readonly boundsKept = new Map<string, { leaves: SolidScriptGeometryLeaf[]; box: THREE.Box3 }>();
  /**
   * Held faces of each solid or mesh, keyed by the latest leaf, so a face
   * lookup only looks at faces of that brush, not every element of the run.
   */
  private readonly facesHeld = new Map<SolidScriptGeometryLeaf, SolidScriptElementFaces>();
  /** How many times bounds were worked out rather than read from what is kept. */
  boundsPasses = 0;
  /** Inherited Mode of a solid whose Mode field was left unset. */
  private readonly modeRoles = new WeakMap<SolidScriptGeometryLeaf, SolidScriptMode>();

  /** @param host Run the elements belong to. */
  constructor(private readonly host: SolidScriptElementsHost) {}

  /**
   * Records the Mode a solid inherits when its own Mode was left unset.
   *
   * @param leaf Solid.
   * @param role Inherited Mode.
   */
  modeRoleSet(leaf: SolidScriptGeometryLeaf, role: SolidScriptMode): void {
    this.modeRoles.set(leaf, role);
  }

  /**
   * Copies a solid's inherited Mode onto a later rewrite of the same brush.
   *
   * @param from Solid or mesh as first seen.
   * @param to Replacement.
   */
  modeRoleCopy(from: SolidScriptGeometryLeaf, to: SolidScriptGeometryLeaf): void {
    const role = this.modeRoleOf(from);
    if (role) this.modeRoles.set(to, role);
  }

  /**
   * Remembers that a later in-place write of a brush is still the same brush
   * element, not a new one.
   *
   * @param from Solid or mesh as first seen.
   * @param to Replacement.
   */
  brushRemember(from: SolidScriptGeometryLeaf, to: SolidScriptGeometryLeaf): void {
    const element = this.brushes.get(from) ?? this.brush(from);
    this.brushes.set(to, element);
  }

  /**
   * Reads the inherited Mode of a solid, following later rewrites.
   *
   * @param leaf Solid or mesh.
   * @returns Inherited Mode, or undefined when none was recorded.
   */
  modeRoleOf(leaf: SolidScriptGeometryLeaf): SolidScriptMode | undefined {
    const latest = this.host.leafLatest(leaf);
    return this.modeRoles.get(latest) ?? this.modeRoles.get(leaf);
  }

  /**
   * Reads the effective CSG Mode of a brush: the Mode that was set, or the
   * inherited insertion Mode, or Additive.
   *
   * @param leaf Solid or mesh.
   * @returns Mode word.
   */
  modeEffective(leaf: SolidScriptGeometryLeaf): SolidScriptMode {
    if (leaf.kind === 'solid' && leaf.mode) return leaf.mode;
    return this.modeRoleOf(leaf) ?? SOLID_SCRIPT_MODE_DEFAULT;
  }

  /**
   * Returns the entry of an element.
   *
   * @param element Element.
   * @returns Entry.
   */
  private entry(element: SolidScriptElement): SolidScriptElementEntry {
    const entry = this.entries[element.id - 1];
    if (!entry || entry.element !== element) throw new Error(`${String(element)} belongs to another run`);
    return entry;
  }

  /**
   * Makes a new element.
   *
   * @param kind What it stands for.
   * @param leaf Solid or mesh.
   * @param parts Plane, planes or position.
   * @returns Entry.
   */
  private add(
    kind: SolidScriptElementKind,
    leaf: SolidScriptGeometryLeaf,
    parts: Partial<SolidScriptElementEntry>,
  ): SolidScriptElementEntry {
    const entry: SolidScriptElementEntry = {
      element: new SolidScriptElement(kind, this.entries.length + 1, kind === 'brush' ? leaf.label : ''),
      leaf,
      data: new Map(),
      ...parts,
    };
    this.entries.push(entry);
    return entry;
  }

  /**
   * Returns the brush element of a solid or mesh, the same one every time.
   *
   * @param leaf Solid or mesh.
   * @returns Brush element.
   */
  brush(leaf: SolidScriptGeometryLeaf): SolidScriptElement {
    const latest = this.host.leafLatest(leaf);
    const cached = this.brushes.get(latest) ?? this.brushes.get(leaf);
    if (cached) {
      cached.mesh = latest.kind === 'mesh';
      this.brushes.set(latest, cached);
      return cached;
    }
    const element = this.add('brush', leaf, {}).element;
    element.mesh = latest.kind === 'mesh';
    this.brushes.set(leaf, element);
    this.brushes.set(latest, element);
    return element;
  }

  /**
   * Returns the face element of a face read now; a face already held is the
   * same element, and a piece of a held face starts with its Data.
   *
   * @param face Face.
   * @returns Face element.
   */
  face(face: SolidScriptFaceFacts): SolidScriptElement {
    const latest = this.host.leafLatest(face.leaf);
    const known = this.faceKnown(latest, face);
    if (known && SolidScriptElements.outlineSame(known.plane!.corners, face.corners)) return known.element;
    const entry = this.add('face', latest, {
      plane: { normal: face.normal.clone(), corners: face.corners.map((corner) => corner.clone()) },
      faceIndex: face.index,
    });
    if (known) for (const [key, datum] of known.data) entry.data.set(key, { ...datum });
    this.faceIndexSet(latest, face.index, entry);
    return entry.element;
  }

  /**
   * Finds a held face of a solid or mesh: the same outline, else a face this
   * one is a piece of.
   *
   * @param latest Solid or mesh now.
   * @param face Face read now.
   * @returns Matching entry, or undefined.
   */
  private faceKnown(latest: SolidScriptGeometryLeaf, face: SolidScriptFaceFacts): SolidScriptElementEntry | undefined {
    const store = this.faceStore(latest);
    const byIndex = store.byIndex.get(face.index);
    if (byIndex?.plane && SolidScriptElements.planeHolds(byIndex.plane, face)) return byIndex;
    let inherited: SolidScriptElementEntry | undefined;
    for (const entry of store.list) {
      if (!entry.plane || !SolidScriptElements.planeHolds(entry.plane, face)) continue;
      if (SolidScriptElements.outlineSame(entry.plane.corners, face.corners)) return entry;
      inherited ??= entry;
    }
    return inherited;
  }

  /**
   * Returns the held faces of a solid or mesh, moving the store onto the latest
   * leaf when a later change replaced it.
   *
   * @param latest Solid or mesh now.
   * @returns Held faces of that solid or mesh.
   */
  private faceStore(latest: SolidScriptGeometryLeaf): SolidScriptElementFaces {
    const direct = this.facesHeld.get(latest);
    if (direct) return direct;
    for (const [leaf, store] of this.facesHeld) {
      if (this.host.leafLatest(leaf) !== latest) continue;
      this.facesHeld.delete(leaf);
      this.facesHeld.set(latest, store);
      return store;
    }
    const store: SolidScriptElementFaces = { byIndex: new Map(), list: [] };
    this.facesHeld.set(latest, store);
    return store;
  }

  /**
   * Remembers a face id under the number it was made from.
   *
   * @param leaf Solid or mesh.
   * @param index Face number.
   * @param entry Entry.
   */
  private faceIndexSet(leaf: SolidScriptGeometryLeaf, index: number, entry: SolidScriptElementEntry): void {
    const store = this.faceStore(leaf);
    store.byIndex.set(index, entry);
    store.list.push(entry);
  }

  /**
   * Moves the faces a change moved without splitting them, such as Extrude Face
   * on a mesh, so their values stay the same faces and keep their Data.
   *
   * @param from The face before the change.
   * @param to The same face after it.
   */
  faceMoved(from: SolidScriptFaceFacts, to: SolidScriptFaceFacts): void {
    const offset = to.center.clone().sub(from.center);
    for (const entry of this.faceStore(this.host.leafLatest(from.leaf)).list) {
      if (!entry.plane || !SolidScriptElements.pieceOf(entry.plane, from)) continue;
      entry.plane = {
        normal: to.normal.clone(),
        corners: entry.plane.corners.map((corner) => corner.clone().add(offset)),
      };
    }
  }

  /**
   * Moves the stored planes and positions of held faces, edges and corners when
   * a later write is the same faces moved as one, so later reads still find
   * them.
   *
   * @param from Solid or mesh as first seen.
   * @param to Replacement.
   */
  follow(from: SolidScriptGeometryLeaf, to: SolidScriptGeometryLeaf): void {
    const matrix = solidScriptGeometryLeafMatrix(from, to);
    if (!matrix || matrix.equals(new THREE.Matrix4())) return;
    const normals = new THREE.Matrix3().getNormalMatrix(matrix);
    const linear = new THREE.Matrix3().setFromMatrix4(matrix);
    const latest = this.host.leafLatest(to);
    for (const entry of this.entries) {
      if (this.host.leafLatest(entry.leaf) !== latest) continue;
      this.entryFollow(entry, matrix, normals, linear);
    }
  }

  /**
   * Applies a move to one held element.
   *
   * @param entry Entry.
   * @param matrix Point transform.
   * @param normals Direction transform.
   */
  private entryFollow(
    entry: SolidScriptElementEntry,
    matrix: THREE.Matrix4,
    normals: THREE.Matrix3,
    linear: THREE.Matrix3,
  ): void {
    if (entry.plane) entry.plane = SolidScriptElements.planeFollow(entry.plane, matrix, normals);
    if (entry.planes)
      entry.planes = [
        SolidScriptElements.planeFollow(entry.planes[0], matrix, normals),
        entry.planes[1] ? SolidScriptElements.planeFollow(entry.planes[1], matrix, normals) : null,
      ];
    if (entry.position) entry.position = entry.position.clone().applyMatrix4(matrix);
    if (entry.direction) entry.direction = entry.direction.clone().applyMatrix3(linear).normalize();
  }

  /**
   * Moves a stored plane.
   *
   * @param plane Plane and outline.
   * @param matrix Point transform.
   * @param normals Direction transform.
   * @returns Moved plane.
   */
  private static planeFollow(
    plane: SolidScriptElementPlane,
    matrix: THREE.Matrix4,
    normals: THREE.Matrix3,
  ): SolidScriptElementPlane {
    return {
      normal: plane.normal.clone().applyMatrix3(normals).normalize(),
      corners: plane.corners.map((corner) => corner.clone().applyMatrix4(matrix)),
    };
  }

  /**
   * Reads the box around every corner of some elements in one pass, kept until
   * the list or a brush in it changes.
   *
   * @param items Brushes, faces, edges or corners.
   * @returns Box; do not change it.
   */
  bounds(items: readonly SolidScriptElement[]): THREE.Box3 {
    const key = items.map((item) => item.id).join(',');
    const leaves = items.map((item) => this.leaf(item));
    const kept = this.boundsKept.get(key);
    if (kept && kept.leaves.every((leaf, index) => leaf === leaves[index])) return kept.box;
    this.boundsPasses++;
    const box = new THREE.Box3().setFromPoints(
      items.flatMap((item) => this.vertices(item).map((vertex) => vertex.position)),
    );
    if (this.boundsKept.size >= 1000) this.boundsKept.clear();
    this.boundsKept.set(key, { leaves, box });
    return box;
  }

  /**
   * Returns the edge element of an edge read now.
   *
   * @param edge Edge.
   * @returns Edge element.
   */
  edge(edge: SolidScriptEdgeFacts): SolidScriptElement {
    const latest = this.host.leafLatest(edge.faces[0].leaf);
    for (const entry of this.entries)
      if (
        entry.element.kind === 'edge' &&
        this.host.leafLatest(entry.leaf) === latest &&
        SolidScriptElements.edgeMatches(entry, edge)
      )
        return entry.element;
    const plane = (face: SolidScriptFaceFacts | null): SolidScriptElementPlane | null =>
      face ? { normal: face.normal.clone(), corners: face.corners.map((corner) => corner.clone()) } : null;
    return this.add('edge', latest, {
      planes: [plane(edge.faces[0])!, plane(edge.faces[1])],
      position: edge.center.clone(),
      direction: edge.direction.clone(),
    }).element;
  }

  /**
   * Returns the vertex element of a corner point read now.
   *
   * @param leaf Solid or mesh it belongs to.
   * @param vertex Corner point.
   * @returns Vertex element.
   */
  vertex(leaf: SolidScriptGeometryLeaf, vertex: SolidScriptVertexFacts): SolidScriptElement {
    const latest = this.host.leafLatest(leaf);
    for (const entry of this.entries)
      if (
        entry.element.kind === 'vertex' &&
        this.host.leafLatest(entry.leaf) === latest &&
        entry.position!.distanceTo(vertex.position) < 1e-6
      )
        return entry.element;
    return this.add('vertex', latest, { position: vertex.position.clone() }).element;
  }

  /**
   * Returns the element of one face's use of one of its corners, the same one
   * every time.
   *
   * @param face Face read now.
   * @param index Corner number in the face, from 0.
   * @returns Face corner element.
   */
  faceCorner(face: SolidScriptFaceFacts, index: number): SolidScriptElement {
    const owner = this.face(face);
    const position = face.corners[index] ?? face.center;
    for (const entry of this.entries)
      if (entry.owner === owner && (entry.position?.distanceTo(position) ?? 1) < 1e-6) return entry.element;
    return this.add('facecorner', this.host.leafLatest(face.leaf), { owner, position: position.clone() }).element;
  }

  /**
   * Finds a face corner now: the piece of its face that still has a corner
   * where it was, and the corner's number there.
   *
   * @param element Face corner element.
   * @returns Face and corner number, or undefined when it was cut away.
   */
  faceCornerAt(element: SolidScriptElement): { face: SolidScriptFaceFacts; index: number } | undefined {
    const entry = this.entry(element);
    const position = entry.position;
    if (!entry.owner || !position) return undefined;
    for (const face of this.faces(entry.owner)) {
      const index = face.corners.findIndex((corner) => corner.distanceTo(position) < 1e-6);
      if (index >= 0) return { face, index };
    }
    return undefined;
  }

  /**
   * Returns the latest solid or mesh of an element.
   *
   * @param element Brush, face, edge or vertex.
   * @returns Solid or mesh.
   */
  leaf(element: SolidScriptElement): SolidScriptGeometryLeaf {
    const latest = this.host.leafLatest(this.entry(element).leaf);
    if (element.kind === 'brush') element.mesh = latest.kind === 'mesh';
    return latest;
  }

  /**
   * Reads the faces of a face element now: every piece it split into. A face
   * that was cut away has none.
   *
   * @param element Face element.
   * @returns Faces.
   */
  faces(element: SolidScriptElement): SolidScriptFaceFacts[] {
    const entry = this.entry(element);
    const faces = solidScriptGeometryFaces([this.leaf(element)]);
    if (element.kind === 'brush') return faces;
    if (element.kind !== 'face' || !entry.plane) return [];
    const at = entry.faceIndex !== undefined ? faces[entry.faceIndex] : undefined;
    if (at && SolidScriptElements.outlineSame(entry.plane.corners, at.corners)) return [at];
    return faces.filter((face) => SolidScriptElements.pieceOf(entry.plane!, face));
  }

  /**
   * Reads the edges of an element now: a brush's or a face's edges, or the edge
   * itself, possibly in pieces.
   *
   * @param element Element.
   * @returns Edges.
   */
  edges(element: SolidScriptElement): SolidScriptEdgeFacts[] {
    const entry = this.entry(element);
    const leaf = this.leaf(element);
    if (element.kind === 'brush') return solidScriptGeometryEdges([leaf]);
    if (element.kind === 'edge') return this.edgePieces(entry, leaf);
    if (element.kind !== 'face') return [];
    return solidScriptGeometryEdges([leaf]).filter((edge) =>
      edge.faces.some((face) => face && SolidScriptElements.pieceOf(entry.plane!, face)),
    );
  }

  /**
   * Reads the pieces of a held edge from the line they share, then keeps only
   * those that still meet the same faces.
   *
   * @param entry Edge entry.
   * @param leaf Latest solid or mesh.
   * @returns Pieces.
   */
  private edgePieces(entry: SolidScriptElementEntry, leaf: SolidScriptGeometryLeaf): SolidScriptEdgeFacts[] {
    const edges =
      entry.position && entry.direction
        ? solidScriptGeometryEdgesAlong(leaf, entry.position, entry.direction)
        : solidScriptGeometryEdges([leaf]);
    return edges.filter((edge) => SolidScriptElements.edgeMatches(entry, edge));
  }

  /**
   * Reads the corner points of an element now.
   *
   * @param element Element.
   * @returns Corner points.
   */
  vertices(element: SolidScriptElement): SolidScriptVertexFacts[] {
    const entry = this.entry(element);
    const leaf = this.leaf(element);
    const all = solidScriptGeometryVertices([leaf]);
    if (element.kind === 'brush') return SolidScriptElements.unique(all);
    if (element.kind === 'vertex') {
      const at = solidScriptGeometryVerticesAt(leaf, entry.position!);
      return at.length ? at : all.filter((vertex) => vertex.position.distanceTo(entry.position!) < 1e-6);
    }
    const corners =
      element.kind === 'face'
        ? this.faces(element).flatMap((face) => face.corners)
        : this.edges(element).flatMap((edge) => [edge.start, edge.end]);
    return SolidScriptElements.unique(
      all.filter((vertex) => corners.some((corner) => corner.distanceTo(vertex.position) < 1e-6)),
    );
  }

  /**
   * Keeps one corner point per position.
   *
   * @param vertices Corner points.
   * @returns Corner points.
   */
  private static unique(vertices: SolidScriptVertexFacts[]): SolidScriptVertexFacts[] {
    const kept: SolidScriptVertexFacts[] = [];
    for (const vertex of vertices)
      if (!kept.some((known) => known.position.distanceTo(vertex.position) < 1e-6)) kept.push(vertex);
    return kept;
  }

  /**
   * Returns the brush an element belongs to.
   *
   * @param element Face, edge or vertex.
   * @returns Brush element.
   */
  parent(element: SolidScriptElement): SolidScriptElement {
    return this.brush(this.leaf(element));
  }

  /**
   * Returns the Data value of an element, a Dictionary that shares its values
   * with the element; a Dictionary is its own Data.
   *
   * @param element Element.
   * @returns Data element.
   */
  data(element: SolidScriptElement): SolidScriptDictionary {
    if (element instanceof SolidScriptDictionary) return element;
    const entry = this.entry(element);
    if (entry.dataElement) return entry.dataElement;
    const dictionary = new SolidScriptDictionary(entry.data, this.entries.length + 1);
    this.add('data', entry.leaf, { data: entry.data, element: dictionary });
    entry.dataElement = dictionary;
    return dictionary;
  }

  /**
   * Returns the values of an element or its Data, by folded key.
   *
   * @param element Element, its Data or a Dictionary.
   * @returns Values.
   */
  private dataValues(element: SolidScriptElement): Map<string, SolidScriptDictionaryEntry> {
    return element instanceof SolidScriptDictionary ? element.entries : this.entry(element).data;
  }

  /**
   * Reads one user value; a key never set reads as empty.
   *
   * @param element Element, its Data or a Dictionary.
   * @param key Key, folded.
   * @returns Value.
   */
  dataRead(element: SolidScriptElement, key: string): SolidScriptValue {
    return this.dataValues(element).get(key)?.value ?? '';
  }

  /**
   * Writes one user value.
   *
   * @param element Element, its Data or a Dictionary.
   * @param key Key, folded.
   * @param name Key as written.
   * @param value Value.
   */
  dataWrite(element: SolidScriptElement, key: string, name: string, value: SolidScriptValue): void {
    this.dataValues(element).set(key, { name, value });
  }

  /**
   * Removes one user value, so it reads as empty again.
   *
   * @param element Element, its Data or a Dictionary.
   * @param key Key, folded.
   */
  dataRemove(element: SolidScriptElement, key: string): void {
    this.dataValues(element).delete(key);
  }

  /**
   * Lists the user values of a Data element or a Dictionary.
   *
   * @param element Data element or Dictionary.
   * @returns Keys as written with their values.
   */
  dataEntries(element: SolidScriptElement): SolidScriptDictionaryEntry[] {
    return [...this.dataValues(element).values()].map((datum) => ({ ...datum }));
  }

  /**
   * Tells whether a face lies on a plane.
   *
   * @param plane Plane.
   * @param face Face.
   * @returns True when it does.
   */
  private static planeHolds(plane: SolidScriptElementPlane, face: SolidScriptFaceFacts): boolean {
    return (
      plane.normal.dot(face.normal) > SOLID_SCRIPT_ELEMENTS_SAME &&
      Math.abs(face.center.clone().sub(plane.corners[0]!).dot(plane.normal)) < 1e-5
    );
  }

  /**
   * Tells whether a face is the face of a plane or a piece of it: on the plane,
   * with its middle inside the outline the face had.
   *
   * @param plane Plane and outline.
   * @param face Face read now.
   * @returns True when it is.
   */
  private static pieceOf(plane: SolidScriptElementPlane, face: SolidScriptFaceFacts): boolean {
    return (
      SolidScriptElements.planeHolds(plane, face) &&
      solidScriptGeometryFaceHolds(plane.corners, plane.normal, face.center)
    );
  }

  /**
   * Tells whether two outlines have the same corners.
   *
   * @param a Corners.
   * @param b Corners.
   * @returns True when they do.
   */
  private static outlineSame(a: readonly THREE.Vector3[], b: readonly THREE.Vector3[]): boolean {
    return a.length === b.length && a.every((corner) => b.some((other) => other.distanceTo(corner) < 1e-6));
  }

  /**
   * Tells whether an edge read now is the edge of an entry: between faces on
   * the same planes, on the same line.
   *
   * @param entry Edge entry.
   * @param edge Edge read now.
   * @returns True when it is.
   */
  private static edgeMatches(entry: SolidScriptElementEntry, edge: SolidScriptEdgeFacts): boolean {
    const [first, second] = entry.planes ?? [];
    if (!first) return false;
    const on = (plane: SolidScriptElementPlane | null | undefined, face: SolidScriptFaceFacts | null): boolean =>
      !plane ? !face : !!face && SolidScriptElements.planeHolds(plane, face);
    const [a, b] = edge.faces;
    if (!((on(first, a) && on(second, b)) || (on(first, b) && on(second, a)))) return false;
    // On the same line as the edge was.
    const offset = entry.position!.clone().sub(edge.start);
    return (
      offset
        .clone()
        .sub(edge.direction.clone().multiplyScalar(offset.dot(edge.direction)))
        .length() < 1e-5
    );
  }
}
