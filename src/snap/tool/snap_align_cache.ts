import { snapSceneExternalRevision } from '@/snap/session/snap_scene_revision.js';
import * as THREE from 'three';
import { getTriangleCount, getTriangleVertexIndices } from '@/selection/pick/utils_triangle_geometry.js';
import { createSnapHit, type SnapHit } from '@/snap/hit/snap_hit.js';
import { snapEdgeElementId, snapFaceElementId, snapVertexElementId } from '@/snap/hit/snap_element_id.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import { chooseSnapHit } from '@/snap/query/snap_query_winner.js';
import { snapScreenDistanceToPoint } from '@/snap/query/snap_screen_project.js';
import { chooseSnapEdgePoint } from '@/snap/candidate/snap_candidate_edge_point.js';
import { isResultMesh, SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { snapAlignFaceCorners } from './snap_align_face_corners.js';
import type { SnapFaceSample } from './snap_face_sample.js';

const noExcludedRoots: ReadonlySet<string> = new Set();

/** One cached triangle that stands in for a face after the mesh is rebuilt. */
interface CachedAlignTriangle {
  mesh: THREE.Mesh;
  root: THREE.Object3D;
  rootId: string;
  faceIndex: number;
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  tangent: THREE.Vector3;
  point: THREE.Vector3;
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

/** One cached edge segment. */
interface CachedAlignEdge {
  rootId: string;
  elementId: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

/**
 * World-space snap targets captured when an align tool starts. Queries keep
 * using these points after a CSG rebuild replaces the live mesh. When a room
 * member moves, deletes or rebuilds something meanwhile, the next query
 * captures the scene again, so targets follow remote edits and deleted ones
 * drop out.
 */
export class SnapAlignCache {
  private readonly triangles: CachedAlignTriangle[];
  private readonly vertices: SnapHit[];
  private readonly edges: CachedAlignEdge[];
  private worldRoot: THREE.Object3D | null;
  private revision: number;

  /** Creates an empty cache. */
  constructor() {
    this.triangles = [];
    this.vertices = [];
    this.edges = [];
    this.worldRoot = null;
    this.revision = snapSceneExternalRevision();
  }

  /**
   * Fills the cache from brush cages and content meshes.
   *
   * @param worldRoot Scene root.
   * @returns This cache.
   */
  build(worldRoot: THREE.Object3D): SnapAlignCache {
    this.worldRoot = worldRoot;
    this.revision = snapSceneExternalRevision();
    worldRoot.updateMatrixWorld(true);
    const gathered = gatherAlignMeshes(worldRoot);
    const coveredBrushIds = new Set<string>();
    for (const mesh of gathered.results) {
      this.addResultFaces(mesh, coveredBrushIds);
    }
    for (const mesh of gathered.brushes) {
      this.addBrush(mesh, coveredBrushIds);
    }
    for (const mesh of gathered.content) {
      this.addContentMesh(mesh);
    }
    return this;
  }

  /**
   * Picks the nearest cached face along a ray. Excluded meshes and roots are
   * skipped while searching, so a face behind the source can win.
   *
   * @param rayOrigin World ray origin.
   * @param rayDirection World ray direction.
   * @param excludedMesh Source mesh to ignore, or null.
   * @param excludedRootIds Roots to ignore.
   * @returns Stored face sample, or null.
   */
  pickFace(
    rayOrigin: THREE.Vector3,
    rayDirection: THREE.Vector3,
    excludedMesh: THREE.Mesh | null,
    excludedRootIds: ReadonlySet<string> = noExcludedRoots,
  ): SnapFaceSample | null {
    this.refreshAfterExternalEdit();
    const ray = new THREE.Ray(rayOrigin, rayDirection.clone().normalize());
    return this.closestFaceSample(ray, rayOrigin, excludedMesh, excludedRootIds);
  }

  /**
   * Returns the best cached vertex, edge, or face for a snap query.
   *
   * @param request Query inputs. Excluded roots are omitted.
   * @returns Winning hit, or null.
   */
  query(request: SnapQueryRequest): SnapHit | null {
    return this.finishQuery(request, false);
  }

  /**
   * Returns a cached hit, preferring a vertex inside the radius over an edge.
   *
   * @param request Query inputs. Excluded roots are omitted.
   * @returns Winning hit, or null.
   */
  queryPreferringVertex(request: SnapQueryRequest): SnapHit | null {
    return this.finishQuery(request, true);
  }

  /**
   * Captures the scene again when it changed outside the local tools since the
   * last capture.
   */
  private refreshAfterExternalEdit(): void {
    if (!this.worldRoot || this.revision === snapSceneExternalRevision()) return;
    this.triangles.length = 0;
    this.vertices.length = 0;
    this.edges.length = 0;
    this.build(this.worldRoot);
  }

  /**
   * Collects hits and picks a winner.
   *
   * @param request Query inputs.
   * @param vertexFirst When true, a vertex inside the radius beats an edge.
   * @returns Winning hit, or null.
   */
  private finishQuery(request: SnapQueryRequest, vertexFirst: boolean): SnapHit | null {
    if (!request.policy.isGeometrySnapActive()) {
      return null;
    }
    this.refreshAfterExternalEdit();
    const hits = this.collectHits(request);
    return chooseCachedHit(hits, request.policy.getScreenRadiusPixels(), vertexFirst);
  }

  /**
   * Collects cached hits the policy allows.
   *
   * @param request Query inputs.
   * @returns Candidate hits.
   */
  private collectHits(request: SnapQueryRequest): SnapHit[] {
    const hits: SnapHit[] = [];
    this.appendVertexHits(request, hits);
    this.appendEdgeHits(request, hits);
    this.appendFaceHit(request, hits);
    return hits;
  }

  /**
   * Finds the closest non-excluded triangle along a ray.
   *
   * @param ray World ray.
   * @param rayOrigin Ray origin used for distance.
   * @param excludedMesh Mesh to skip.
   * @param excludedRootIds Roots to skip.
   * @returns Face sample, or null.
   */
  private closestFaceSample(
    ray: THREE.Ray,
    rayOrigin: THREE.Vector3,
    excludedMesh: THREE.Mesh | null,
    excludedRootIds: ReadonlySet<string>,
  ): SnapFaceSample | null {
    const hitPoint = new THREE.Vector3();
    let best: CachedAlignTriangle | null = null;
    let bestPoint: THREE.Vector3 | null = null;
    let bestDistance = Infinity;
    for (const triangle of this.triangles) {
      const chosen = this.measureTriangle(
        ray,
        rayOrigin,
        triangle,
        excludedMesh,
        excludedRootIds,
        hitPoint,
        bestDistance,
      );
      if (!chosen) {
        continue;
      }
      best = triangle;
      bestPoint = chosen.point;
      bestDistance = chosen.distance;
    }
    if (!best || !bestPoint) {
      return null;
    }
    return sampleFromTriangle(best, bestPoint, snapAlignFaceCorners(this.triangles, best));
  }

  /**
   * Measures one triangle when it is closer than the current best.
   *
   * @param ray World ray.
   * @param rayOrigin Ray origin.
   * @param triangle Cached triangle.
   * @param excludedMesh Mesh to skip.
   * @param excludedRootIds Roots to skip.
   * @param hitPoint Scratch hit point.
   * @param bestDistance Closest distance so far.
   * @returns Hit point and distance, or null.
   */
  private measureTriangle(
    ray: THREE.Ray,
    rayOrigin: THREE.Vector3,
    triangle: CachedAlignTriangle,
    excludedMesh: THREE.Mesh | null,
    excludedRootIds: ReadonlySet<string>,
    hitPoint: THREE.Vector3,
    bestDistance: number,
  ): { point: THREE.Vector3; distance: number } | null {
    if (triangleIsExcluded(triangle, excludedMesh, excludedRootIds)) {
      return null;
    }
    const hit = ray.intersectTriangle(triangle.a, triangle.b, triangle.c, true, hitPoint);
    if (!hit) {
      return null;
    }
    const distance = rayOrigin.distanceTo(hit);
    if (distance >= bestDistance) {
      return null;
    }
    return { point: hit.clone(), distance };
  }

  /**
   * Caches visible result triangles. Each triangle moves the brush that
   * authored it.
   *
   * @param mesh Compiled result mesh.
   * @param coveredBrushIds Brushes that already have a visible face.
   */
  private addResultFaces(mesh: THREE.Mesh, coveredBrushIds: Set<string>): void {
    const positions = mesh.geometry.getAttribute('position');
    if (!positions) {
      return;
    }
    const count = getTriangleCount(mesh.geometry);
    for (let faceIndex = 0; faceIndex < count; faceIndex++) {
      this.addResultTriangle(mesh, faceIndex, positions, coveredBrushIds);
    }
  }

  /**
   * Caches one result triangle and records its brush as covered.
   *
   * @param mesh Result mesh.
   * @param faceIndex Triangle index.
   * @param positions Position attribute.
   * @param coveredBrushIds Brushes that already have a visible face.
   */
  private addResultTriangle(
    mesh: THREE.Mesh,
    faceIndex: number,
    positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    coveredBrushIds: Set<string>,
  ): void {
    const corners = getTriangleVertexIndices(mesh.geometry, faceIndex);
    const polygon = corners
      .map((index) => worldAttributePoint(positions, index, mesh.matrixWorld))
      .filter((point): point is THREE.Vector3 => point !== null);
    const brushId = triangleBrushId(mesh, faceIndex);
    const brushMesh = brushPreviewFor(mesh, brushId);
    if (brushId.length > 0) {
      coveredBrushIds.add(brushId);
    }
    this.addPolygon(mesh, faceIndex, polygon, brushMesh ?? mesh);
  }

  /**
   * Caches one brush cage in world space. Hull faces are omitted when the
   * compiled result already has faces for that brush.
   *
   * @param mesh Brush preview mesh.
   * @param coveredBrushIds Brushes represented by the result mesh.
   */
  private addBrush(mesh: THREE.Mesh, coveredBrushIds: ReadonlySet<string>): void {
    const model = SolidModel.fromObject(mesh);
    const instance = model?.findBrushByMesh(mesh);
    if (!instance) {
      return;
    }
    const matrix = mesh.matrixWorld;
    const world = instance.brush.vertices.map((vertex) => vertex.clone().applyMatrix4(matrix));
    this.addVertices(mesh.uuid, instance.id, world);
    this.addBrushEdges(mesh.uuid, instance.id, instance.brush.wingEdges, world);
    if (coveredBrushIds.has(instance.id)) {
      return;
    }
    this.addBrushFaces(mesh, instance.brush.faces, instance.brush.wingEdges, world);
  }

  /**
   * Caches one content mesh in world space.
   *
   * @param mesh Content mesh.
   */
  private addContentMesh(mesh: THREE.Mesh): void {
    const positions = mesh.geometry.getAttribute('position');
    if (!positions) {
      return;
    }
    const world: THREE.Vector3[] = [];
    for (let index = 0; index < positions.count; index++) {
      world.push(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
    }
    this.addVertices(mesh.uuid, mesh.uuid, world);
    this.addContentEdges(mesh, world);
    this.addContentTriangles(mesh, world);
  }

  /**
   * Stores vertex hits.
   *
   * @param rootId Transform root id.
   * @param ownerId Element owner id.
   * @param world World positions.
   */
  private addVertices(rootId: string, ownerId: string, world: readonly THREE.Vector3[]): void {
    for (let index = 0; index < world.length; index++) {
      const point = world[index];
      if (!point) {
        continue;
      }
      this.vertices.push(
        createSnapHit(point, new THREE.Vector3(), 'vertex', rootId, snapVertexElementId(ownerId, index), 0, null, null),
      );
    }
  }

  /**
   * Stores unique brush edges.
   *
   * @param rootId Transform root id.
   * @param ownerId Brush id.
   * @param wingEdges Wing edges.
   * @param world World vertex positions.
   */
  private addBrushEdges(
    rootId: string,
    ownerId: string,
    wingEdges: readonly { vertexIndex: number; twinIndex: number }[],
    world: readonly THREE.Vector3[],
  ): void {
    for (let edgeIndex = 0; edgeIndex < wingEdges.length; edgeIndex++) {
      const edge = wingEdges[edgeIndex];
      if (!edge || edge.twinIndex < edgeIndex) {
        continue;
      }
      const twin = wingEdges[edge.twinIndex];
      if (!twin) {
        continue;
      }
      const start = world[edge.vertexIndex];
      const end = world[twin.vertexIndex];
      if (!start || !end) {
        continue;
      }
      this.edges.push(cachedEdge(rootId, ownerId, edge.vertexIndex, twin.vertexIndex, start, end));
    }
  }

  /**
   * Stores brush face triangles.
   *
   * @param mesh Brush mesh.
   * @param faces Brush faces.
   * @param wingEdges Wing edges.
   * @param world World vertex positions.
   */
  private addBrushFaces(
    mesh: THREE.Mesh,
    faces: readonly { firstEdge: number; edgeCount: number }[],
    wingEdges: readonly { vertexIndex: number }[],
    world: readonly THREE.Vector3[],
  ): void {
    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
      const face = faces[faceIndex];
      if (!face) {
        continue;
      }
      const polygon = facePolygon(face, wingEdges, world);
      this.addPolygon(mesh, faceIndex, polygon, mesh);
    }
  }

  /**
   * Stores unique content-mesh edges.
   *
   * @param mesh Content mesh.
   * @param world World vertex positions.
   */
  private addContentEdges(mesh: THREE.Mesh, world: readonly THREE.Vector3[]): void {
    const seen = new Set<string>();
    const count = getTriangleCount(mesh.geometry);
    for (let faceIndex = 0; faceIndex < count; faceIndex++) {
      this.addTriangleEdges(mesh.uuid, getTriangleVertexIndices(mesh.geometry, faceIndex), world, seen);
    }
  }

  /**
   * Stores the three sides of one content triangle.
   *
   * @param ownerId Mesh id.
   * @param corners Triangle vertex indices.
   * @param world World vertex positions.
   * @param seen Edge keys already stored.
   */
  private addTriangleEdges(
    ownerId: string,
    corners: readonly number[],
    world: readonly THREE.Vector3[],
    seen: Set<string>,
  ): void {
    this.addContentEdge(ownerId, corners[0], corners[1], world, seen);
    this.addContentEdge(ownerId, corners[1], corners[2], world, seen);
    this.addContentEdge(ownerId, corners[2], corners[0], world, seen);
  }

  /**
   * Stores one content edge when it has not been stored yet.
   *
   * @param ownerId Mesh id.
   * @param firstVertex First corner, if present.
   * @param secondVertex Second corner, if present.
   * @param world World vertex positions.
   * @param seen Edge keys already stored.
   */
  private addContentEdge(
    ownerId: string,
    firstVertex: number | undefined,
    secondVertex: number | undefined,
    world: readonly THREE.Vector3[],
    seen: Set<string>,
  ): void {
    if (firstVertex === undefined || secondVertex === undefined) {
      return;
    }
    const low = Math.min(firstVertex, secondVertex);
    const high = Math.max(firstVertex, secondVertex);
    const key = `${low}:${high}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const start = world[low];
    const end = world[high];
    if (!start || !end) {
      return;
    }
    this.edges.push(cachedEdge(ownerId, ownerId, low, high, start, end));
  }

  /**
   * Stores content triangles.
   *
   * @param mesh Content mesh.
   * @param world World vertex positions.
   */
  private addContentTriangles(mesh: THREE.Mesh, world: readonly THREE.Vector3[]): void {
    const count = getTriangleCount(mesh.geometry);
    for (let faceIndex = 0; faceIndex < count; faceIndex++) {
      const corners = getTriangleVertexIndices(mesh.geometry, faceIndex);
      const polygon = corners.map((index) => world[index]).filter((point): point is THREE.Vector3 => !!point);
      this.addPolygon(mesh, faceIndex, polygon, mesh);
    }
  }

  /**
   * Fans a polygon into cached triangles.
   *
   * @param mesh Visible mesh used for the highlight.
   * @param faceIndex Triangle index on that mesh.
   * @param polygon World polygon.
   * @param root Object that moves when this face is chosen.
   */
  private addPolygon(
    mesh: THREE.Mesh,
    faceIndex: number,
    polygon: readonly THREE.Vector3[],
    root: THREE.Object3D,
  ): void {
    const origin = polygon[0];
    const second = polygon[1];
    if (!origin || !second || polygon.length < 3) {
      return;
    }
    const normal = polygonNormal(polygon);
    const centroid = polygonCentroid(polygon);
    const tangent = second.clone().sub(origin);
    for (let index = 1; index < polygon.length - 1; index++) {
      this.pushFanTriangle(mesh, root, faceIndex, polygon, index, normal, centroid, tangent, origin);
    }
  }

  /**
   * Stores one fan triangle when both extra corners exist.
   *
   * @param mesh Visible mesh.
   * @param root Object that moves.
   * @param faceIndex Triangle index.
   * @param polygon World polygon.
   * @param index Fan index.
   * @param normal Face normal.
   * @param centroid Face centroid.
   * @param tangent Face tangent.
   * @param origin First polygon vertex.
   */
  private pushFanTriangle(
    mesh: THREE.Mesh,
    root: THREE.Object3D,
    faceIndex: number,
    polygon: readonly THREE.Vector3[],
    index: number,
    normal: THREE.Vector3,
    centroid: THREE.Vector3,
    tangent: THREE.Vector3,
    origin: THREE.Vector3,
  ): void {
    const cornerB = polygon[index];
    const cornerC = polygon[index + 1];
    if (!cornerB || !cornerC) {
      return;
    }
    this.triangles.push({
      mesh,
      root,
      rootId: root.uuid,
      faceIndex,
      normal: normal.clone(),
      centroid: centroid.clone(),
      tangent: tangent.clone(),
      point: origin.clone(),
      a: origin.clone(),
      b: cornerB.clone(),
      c: cornerC.clone(),
    });
  }

  /**
   * Appends cached vertices that the policy allows.
   *
   * @param request Query.
   * @param hits Output hits.
   */
  private appendVertexHits(request: SnapQueryRequest, hits: SnapHit[]): void {
    if (!request.policy.allowsKind('vertex')) {
      return;
    }
    for (const vertex of this.vertices) {
      if (request.excludedRootIds.has(vertex.transformRootId)) {
        continue;
      }
      const distance = snapScreenDistanceToPoint(
        vertex.point,
        request.camera,
        request.pointerPixels,
        request.viewportWidth,
        request.viewportHeight,
      );
      if (distance === null || distance > request.policy.getScreenRadiusPixels()) {
        continue;
      }
      hits.push({
        ...vertex,
        point: vertex.point.clone(),
        normal: vertex.normal.clone(),
        screenDistancePixels: distance,
      });
    }
  }

  /**
   * Appends cached edges that the policy allows.
   *
   * @param request Query.
   * @param hits Output hits.
   */
  private appendEdgeHits(request: SnapQueryRequest, hits: SnapHit[]): void {
    if (!request.policy.allowsKind('edge')) {
      return;
    }
    for (const edge of this.edges) {
      if (request.excludedRootIds.has(edge.rootId)) {
        continue;
      }
      const choice = chooseSnapEdgePoint(
        edge.start,
        edge.end,
        request.camera,
        request.pointerPixels,
        request.viewportWidth,
        request.viewportHeight,
        request.policy.getScreenRadiusPixels(),
      );
      if (!choice) {
        continue;
      }
      const direction = edge.end.clone().sub(edge.start).normalize();
      hits.push(
        createSnapHit(
          choice.point,
          direction,
          'edge',
          edge.rootId,
          edge.elementId,
          choice.screenDistancePixels,
          edge.start,
          edge.end,
        ),
      );
    }
  }

  /**
   * Appends the cached face under the pointer ray.
   *
   * @param request Query.
   * @param hits Output hits.
   */
  private appendFaceHit(request: SnapQueryRequest, hits: SnapHit[]): void {
    if (!request.policy.allowsKind('face')) {
      return;
    }
    const face = this.pickFace(request.rayOrigin, request.rayDirection, null, request.excludedRootIds);
    if (!face) {
      return;
    }
    const elementId = snapFaceElementId(face.root.uuid, face.faceIndex);
    hits.push(createSnapHit(face.point, face.normal, 'face', face.root.uuid, elementId, 0, null, null));
  }
}

/**
 * Builds a cache from the current world.
 *
 * @param worldRoot Scene root.
 * @returns Filled cache.
 */
export function buildSnapAlignCache(worldRoot: THREE.Object3D): SnapAlignCache {
  return new SnapAlignCache().build(worldRoot);
}

/** Meshes grouped by how an align cache reads them. */
interface GatheredAlignMeshes {
  results: THREE.Mesh[];
  brushes: THREE.Mesh[];
  content: THREE.Mesh[];
}

/**
 * Groups scene meshes into result surfaces, brush hulls, and content.
 *
 * @param worldRoot Scene root.
 * @returns Grouped meshes.
 */
function gatherAlignMeshes(worldRoot: THREE.Object3D): GatheredAlignMeshes {
  const gathered: GatheredAlignMeshes = { results: [], brushes: [], content: [] };
  worldRoot.traverse((object) => {
    classifyAlignMesh(object, gathered);
  });
  return gathered;
}

/**
 * Appends one object to the group it belongs to.
 *
 * @param object Scene object.
 * @param gathered Output groups.
 */
function classifyAlignMesh(object: THREE.Object3D, gathered: GatheredAlignMeshes): void {
  if (!(object instanceof THREE.Mesh)) {
    return;
  }
  if (isResultMesh(object)) {
    gathered.results.push(object);
    return;
  }
  if (SolidBrushVisual.isBrushObject(object)) {
    gathered.brushes.push(object);
    return;
  }
  if (SolidBrushVisual.shouldSkipFacePick(object)) {
    return;
  }
  gathered.content.push(object);
}

/**
 * Reads a position attribute vertex in world space.
 *
 * @param positions Position attribute.
 * @param index Vertex index.
 * @param matrix World matrix.
 * @returns World point, or null when the index is missing.
 */
function worldAttributePoint(
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number | undefined,
  matrix: THREE.Matrix4,
): THREE.Vector3 | null {
  if (index === undefined) {
    return null;
  }
  return new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix);
}

/**
 * Returns the brush id stored for one result triangle.
 *
 * @param mesh Result mesh.
 * @param faceIndex Triangle index.
 * @returns Brush id, or an empty string.
 */
function triangleBrushId(mesh: THREE.Mesh, faceIndex: number): string {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(sources)) {
    return '';
  }
  const source = sources[faceIndex] as { brushId?: unknown } | undefined;
  if (!source || typeof source.brushId !== 'string') {
    return '';
  }
  return source.brushId;
}

/**
 * Returns the preview mesh of the brush that authored a result triangle.
 *
 * @param mesh Result mesh.
 * @param brushId Brush id.
 * @returns Brush preview mesh, or null.
 */
function brushPreviewFor(mesh: THREE.Mesh, brushId: string): THREE.Mesh | null {
  if (brushId.length === 0) {
    return null;
  }
  const preview = SolidModel.fromObject(mesh)?.findBrush(brushId)?.mesh;
  return preview ?? null;
}

/**
 * Picks a vertex first when requested, otherwise the shared snap winner.
 *
 * @param hits Candidate hits.
 * @param radius Screen radius.
 * @param vertexFirst Whether a vertex inside the radius beats an edge.
 * @returns Winning hit, or null.
 */
function chooseCachedHit(hits: readonly SnapHit[], radius: number, vertexFirst: boolean): SnapHit | null {
  if (vertexFirst) {
    const vertex = closestVertexInsideRadius(hits, radius);
    if (vertex) {
      return vertex;
    }
  }
  return chooseSnapHit(hits, radius);
}

/**
 * Returns the closest vertex inside the screen radius.
 *
 * @param hits Candidate hits.
 * @param radius Screen radius.
 * @returns Closest vertex, or null.
 */
function closestVertexInsideRadius(hits: readonly SnapHit[], radius: number): SnapHit | null {
  let best: SnapHit | null = null;
  for (const hit of hits) {
    best = closerVertex(best, hit, radius);
  }
  return best;
}

/**
 * Keeps the closer in-radius vertex.
 *
 * @param current Current vertex, or null.
 * @param candidate Next hit.
 * @param radius Screen radius.
 * @returns The closer vertex.
 */
function closerVertex(current: SnapHit | null, candidate: SnapHit, radius: number): SnapHit | null {
  if (candidate.kind !== 'vertex' || candidate.screenDistancePixels > radius) {
    return current;
  }
  if (!current || candidate.screenDistancePixels < current.screenDistancePixels) {
    return candidate;
  }
  return current;
}

/**
 * Returns whether a triangle belongs to an excluded mesh or root.
 *
 * @param triangle Cached triangle.
 * @param excludedMesh Mesh to skip.
 * @param excludedRootIds Roots to skip.
 * @returns True when the triangle must be ignored.
 */
function triangleIsExcluded(
  triangle: CachedAlignTriangle,
  excludedMesh: THREE.Mesh | null,
  excludedRootIds: ReadonlySet<string>,
): boolean {
  if (excludedMesh && triangle.mesh === excludedMesh) {
    return true;
  }
  return excludedRootIds.has(triangle.rootId);
}

/**
 * Stores one unique brush edge.
 *
 * @param rootId Transform root id.
 * @param ownerId Brush id.
 * @param firstVertex First vertex index.
 * @param secondVertex Second vertex index.
 * @param start World start.
 * @param end World end.
 * @returns Cached edge.
 */
function cachedEdge(
  rootId: string,
  ownerId: string,
  firstVertex: number,
  secondVertex: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
): CachedAlignEdge {
  const low = Math.min(firstVertex, secondVertex);
  const high = Math.max(firstVertex, secondVertex);
  return {
    rootId,
    elementId: snapEdgeElementId(ownerId, low, high),
    start: start.clone(),
    end: end.clone(),
  };
}

/**
 * Copies a cached triangle into a face sample.
 *
 * @param triangle Cached triangle.
 * @param hitPoint Ray hit, cloned into the sample point.
 * @param corners World corners of the whole face.
 * @returns Face sample.
 */
function sampleFromTriangle(
  triangle: CachedAlignTriangle,
  hitPoint: THREE.Vector3,
  corners: readonly THREE.Vector3[],
): SnapFaceSample {
  return {
    mesh: triangle.mesh,
    root: triangle.root,
    faceIndex: triangle.faceIndex,
    normal: triangle.normal.clone(),
    centroid: triangle.centroid.clone(),
    tangent: triangle.tangent.clone(),
    point: hitPoint.clone(),
    corners: corners.map((corner) => corner.clone()),
  };
}

/**
 * Collects the world polygon of a brush face.
 *
 * @param face Face edge range.
 * @param wingEdges Wing edges.
 * @param world World vertices.
 * @returns Polygon.
 */
function facePolygon(
  face: { firstEdge: number; edgeCount: number },
  wingEdges: readonly { vertexIndex: number }[],
  world: readonly THREE.Vector3[],
): THREE.Vector3[] {
  const polygon: THREE.Vector3[] = [];
  for (let offset = 0; offset < face.edgeCount; offset++) {
    const edge = wingEdges[face.firstEdge + offset];
    const point = edge ? world[edge.vertexIndex] : undefined;
    if (point) {
      polygon.push(point);
    }
  }
  return polygon;
}

/**
 * Newell normal of a polygon.
 *
 * @param polygon World polygon.
 * @returns Unit normal.
 */
function polygonNormal(polygon: readonly THREE.Vector3[]): THREE.Vector3 {
  const normal = new THREE.Vector3();
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (!current || !next) {
      continue;
    }
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  if (normal.lengthSq() < 1e-12) {
    return new THREE.Vector3(0, 1, 0);
  }
  return normal.normalize();
}

/**
 * Average of a polygon's vertices.
 *
 * @param polygon World polygon.
 * @returns Centroid.
 */
function polygonCentroid(polygon: readonly THREE.Vector3[]): THREE.Vector3 {
  const centroid = new THREE.Vector3();
  for (const point of polygon) {
    centroid.add(point);
  }
  return centroid.multiplyScalar(1 / polygon.length);
}
