import * as THREE from 'three';
import {
  solidScriptGeometryEdges,
  solidScriptGeometryFaceHolds,
  solidScriptGeometryFaces,
  solidScriptGeometryVertices,
  type SolidScriptEdgeFacts,
  type SolidScriptFaceFacts,
  type SolidScriptGeometryLeaf,
  type SolidScriptVertexFacts,
} from './solid_script_geometry.js';
import { SolidScriptElement, type SolidScriptElementKind, type SolidScriptValue } from './solid_script_value.js';

/** A plane a face lies on, with the outline the face had when its id was made. */
interface SolidScriptElementPlane {
  normal: THREE.Vector3;
  /** Corners of the face when the id was made; pieces inside it are the face. */
  corners: THREE.Vector3[];
}

/** One user value under .Data, with the spelling its key was written in. */
interface SolidScriptElementDatum {
  name: string;
  value: SolidScriptValue;
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
  /** Vertex: where it was. */
  position?: THREE.Vector3;
  /** The user's own values, by key. */
  data: Map<string, SolidScriptElementDatum>;
  /** The Data value of the element, made on first read. */
  dataElement?: SolidScriptElement;
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

  /** @param host Run the elements belong to. */
  constructor(private readonly host: SolidScriptElementsHost) {}

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
    for (const [known, element] of this.brushes) if (this.host.leafLatest(known) === latest) return element;
    const element = this.add('brush', leaf, {}).element;
    this.brushes.set(leaf, element);
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
    let inherited: SolidScriptElementEntry | undefined;
    for (const entry of this.entries) {
      if (entry.element.kind !== 'face' || !entry.plane || this.host.leafLatest(entry.leaf) !== latest) continue;
      if (!SolidScriptElements.planeHolds(entry.plane, face)) continue;
      if (SolidScriptElements.outlineSame(entry.plane.corners, face.corners)) return entry.element;
      inherited ??= entry;
    }
    const entry = this.add('face', latest, {
      plane: { normal: face.normal.clone(), corners: face.corners.map((corner) => corner.clone()) },
    });
    if (inherited) for (const [key, datum] of inherited.data) entry.data.set(key, { ...datum });
    return entry.element;
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
      position: edge.middle.clone(),
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
   * Returns the latest solid or mesh of an element.
   *
   * @param element Brush, face, edge or vertex.
   * @returns Solid or mesh.
   */
  leaf(element: SolidScriptElement): SolidScriptGeometryLeaf {
    return this.host.leafLatest(this.entry(element).leaf);
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
    if (element.kind !== 'face') return [];
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
    const edges = solidScriptGeometryEdges([this.leaf(element)]);
    if (element.kind === 'brush') return edges;
    if (element.kind === 'edge') return edges.filter((edge) => SolidScriptElements.edgeMatches(entry, edge));
    if (element.kind !== 'face') return [];
    return edges.filter((edge) => edge.faces.some((face) => face && SolidScriptElements.pieceOf(entry.plane!, face)));
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
    if (element.kind === 'vertex') return all.filter((vertex) => vertex.position.distanceTo(entry.position!) < 1e-6);
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
   * Returns the Data value of an element.
   *
   * @param element Element.
   * @returns Data element.
   */
  data(element: SolidScriptElement): SolidScriptElement {
    const entry = this.entry(element);
    if (entry.dataElement) return entry.dataElement;
    const data = this.add('data', entry.leaf, { data: entry.data });
    entry.dataElement = data.element;
    return data.element;
  }

  /**
   * Reads one user value; a key never set reads as empty.
   *
   * @param element Element or its Data.
   * @param key Key, folded.
   * @returns Value.
   */
  dataRead(element: SolidScriptElement, key: string): SolidScriptValue {
    return this.entry(element).data.get(key)?.value ?? '';
  }

  /**
   * Writes one user value.
   *
   * @param element Element or its Data.
   * @param key Key, folded.
   * @param name Key as written.
   * @param value Value.
   */
  dataWrite(element: SolidScriptElement, key: string, name: string, value: SolidScriptValue): void {
    this.entry(element).data.set(key, { name, value });
  }

  /**
   * Lists the user values of a Data element.
   *
   * @param element Data element.
   * @returns Keys as written with their values.
   */
  dataEntries(element: SolidScriptElement): { name: string; value: SolidScriptValue }[] {
    return [...this.entry(element).data.values()].map((datum) => ({ ...datum }));
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
