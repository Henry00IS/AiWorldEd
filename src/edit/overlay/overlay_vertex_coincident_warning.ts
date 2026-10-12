import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { BrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import type { ComponentCageMeshSource } from '@/edit/component/component_edit_cage_overlay.js';
import {
  detectPackedCoincidentPositions,
  detectTopologyCoincidentClusters,
} from '@/edit/topology/topology_coincident.js';
import {
  collectCoincidentSampleGroups,
  type CoincidentPositionSample,
} from '@/edit/topology/topology_coincident_grid.js';
import { TOPOLOGY_VERTEX_EQUAL_EPSILON } from '@/edit/topology/topology_epsilon.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';

/** Screen-pixel size of the warning marker. */
export const COINCIDENT_WARNING_POINT_SIZE = 20;

/** NDC offset so the triangle sits beside the vertex, not on it. */
export const COINCIDENT_WARNING_SCREEN_OFFSET_NDC = 0.018;

/** Draw order above cage vertex dots. */
const WARNING_RENDER_ORDER = 1020;

/**
 * Yellow warning triangles at coincident topology vertices. Point size is
 * constant in CSS pixels so 2D and 3D views stay readable.
 */
export class OverlayVertexCoincidentWarning {
  private readonly scene: THREE.Scene;
  private readonly points: THREE.Points;

  /**
   * Creates the overlay in a scene.
   *
   * @param scene Scene that receives the markers.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.points = createWarningPoints();
    this.scene.add(this.points);
  }

  /**
   * Rebuilds markers from working geometries already in world space.
   *
   * @param worldGeometries Working copies whose positions are world-space.
   */
  updateFromWorldGeometries(worldGeometries: readonly TopologyWorkingGeometry[]): void {
    const coords: number[] = [];
    for (const geometry of worldGeometries) {
      appendClusterPositions(geometry, coords);
    }
    replacePointPositions(this.points.geometry, coords);
  }

  /**
   * Rebuilds markers from mesh documents and brush cages without copying every
   * face.
   *
   * @param meshSources Content meshes.
   * @param brushCages Brush cages.
   */
  updateFromCageSources(meshSources: readonly ComponentCageMeshSource[], brushCages: readonly BrushEditCage[]): void {
    const coords: number[] = [];
    for (const source of meshSources) {
      appendDocumentClusters(source, coords);
    }
    for (const cage of brushCages) {
      appendBrushCageClusters(cage, coords);
    }
    replacePointPositions(this.points.geometry, coords);
  }

  /** Removes markers and disposes resources. */
  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    const material = this.points.material;
    if (!Array.isArray(material)) {
      material.dispose();
    }
  }
}

const scratchClusterPosition = new THREE.Vector3();

/**
 * Appends world positions of coincident vertices in a mesh document.
 *
 * @param source Mesh source.
 * @param coords Packed xyz accumulator.
 */
function appendDocumentClusters(source: ComponentCageMeshSource, coords: number[]): void {
  source.mesh.updateMatrixWorld(true);
  for (const cluster of readCachedDocumentClusters(source.document)) {
    scratchClusterPosition.set(cluster.x, cluster.y, cluster.z).applyMatrix4(source.mesh.matrixWorld);
    coords.push(scratchClusterPosition.x, scratchClusterPosition.y, scratchClusterPosition.z);
  }
}

/** Cached coincident representatives for one document generation. */
interface DocumentClusterCacheEntry {
  generation: number;
  clusters: readonly CoincidentPositionSample[];
}

const documentClusterCache = new WeakMap<MeshDocument, DocumentClusterCacheEntry>();

/**
 * Returns coincident representatives, rebuilding only when generation changes.
 *
 * @param document Mesh document.
 * @returns One position per coincident cluster.
 */
function readCachedDocumentClusters(document: MeshDocument): readonly CoincidentPositionSample[] {
  const generation = document.getGeometryGeneration();
  const cached = documentClusterCache.get(document);
  if (cached && cached.generation === generation) {
    return cached.clusters;
  }
  const clusters = detectPackedCoincidentPositions(document.getTopology().getPositions());
  documentClusterCache.set(document, { generation, clusters });
  return clusters;
}

/**
 * Appends world positions of coincident brush-cage vertices.
 *
 * @param cage Brush cage.
 * @param coords Packed xyz accumulator.
 */
function appendBrushCageClusters(cage: BrushEditCage, coords: number[]): void {
  const samples = cage.worldPositions.map((position) => ({ x: position.x, y: position.y, z: position.z }));
  const groups = collectCoincidentSampleGroups(samples, TOPOLOGY_VERTEX_EQUAL_EPSILON);
  for (const group of groups) {
    const index = group[0];
    const position = index === undefined ? undefined : cage.worldPositions[index];
    if (!position) {
      continue;
    }
    coords.push(position.x, position.y, position.z);
  }
}

/**
 * Appends one world position per coincident cluster.
 *
 * @param geometry World-space working geometry.
 * @param coords Packed xyz accumulator.
 */
function appendClusterPositions(geometry: TopologyWorkingGeometry, coords: number[]): void {
  for (const cluster of detectTopologyCoincidentClusters(geometry)) {
    coords.push(cluster.position.x, cluster.position.y, cluster.position.z);
  }
}

/**
 * Replaces point positions.
 *
 * @param geometry Target geometry.
 * @param coords Packed xyz.
 */
function replacePointPositions(geometry: THREE.BufferGeometry, coords: number[]): void {
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(coords), 3));
  geometry.computeBoundingSphere();
}

/**
 * Builds the warning point cloud.
 *
 * @returns Points object.
 */
function createWarningPoints(): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(Theme.vertexCoincidentWarningColor) },
      pointSize: { value: COINCIDENT_WARNING_POINT_SIZE },
      screenOffsetNdc: {
        value: new THREE.Vector2(COINCIDENT_WARNING_SCREEN_OFFSET_NDC, COINCIDENT_WARNING_SCREEN_OFFSET_NDC),
      },
    },
    vertexShader: WARNING_VERTEX_SHADER,
    fragmentShader: WARNING_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'overlay_vertex_coincident_warning';
  points.renderOrder = WARNING_RENDER_ORDER;
  points.frustumCulled = false;
  points.raycast = () => undefined;
  return points;
}

/** Projects points and writes a constant screen size. */
const WARNING_VERTEX_SHADER = `
  uniform float pointSize;
  uniform vec2 screenOffsetNdc;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    clip.xy += screenOffsetNdc * clip.w;
    gl_Position = clip;
    gl_PointSize = pointSize;
  }
`;

/**
 * Draws one yellow triangle with a dark exclamation; everything else is
 * discarded.
 */
const WARNING_FRAGMENT_SHADER = `
  uniform vec3 color;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;
    float span = 1.74;
    float along = clamp((p.y + 0.82) / span, 0.0, 1.0);
    float halfWidth = mix(0.90, 0.0, along);
    bool insideTriangle = p.y >= -0.82 && p.y <= 0.92 && abs(p.x) <= halfWidth;
    if (!insideTriangle) {
      discard;
    }
    bool exclamationBar = abs(p.x) < 0.08 && p.y > -0.08 && p.y < 0.42;
    bool exclamationDot = abs(p.x) < 0.08 && p.y > -0.50 && p.y < -0.28;
    vec3 shade = (exclamationBar || exclamationDot) ? vec3(0.08, 0.06, 0.02) : color;
    gl_FragColor = vec4(shade, 1.0);
  }
`;
