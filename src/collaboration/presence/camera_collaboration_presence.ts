import * as THREE from 'three';
import { fadeCollaborationPresenceCamera } from '@/collaboration/presence/fade_collaboration_presence.js';
import { NametagCollaborationPresence } from '@/collaboration/presence/nametag_collaboration_presence.js';
import { PoseCollaborationPresence } from '@/collaboration/presence/pose_collaboration_presence.js';
import { screenCollaborationWorldPerPixel } from '@/collaboration/presence/screen_collaboration_presence.js';
import { presenceCollaborationTag } from '@/collaboration/presence/tag_collaboration_presence.js';
import type { PresenceEntry } from '@/collaboration/shared/presence_frame.js';

/** Smallest gizmo depth in world units. */
const CAMERA_COLLABORATION_PRESENCE_WORLD = 0.35;
/** Gizmo depth in screen pixels when that is larger. */
const CAMERA_COLLABORATION_PRESENCE_PIXELS = 44;
/** Assumed width over height of the remote viewport (not sent). */
const CAMERA_COLLABORATION_PRESENCE_ASPECT = 1.6;
/** Vertex count of the frustum lines (8 edges plus the up triangle). */
const CAMERA_COLLABORATION_PRESENCE_VERTICES = 22;

/** Opacity of the lens fill when fully visible. */
const CAMERA_COLLABORATION_PRESENCE_LENS_OPACITY = 0.22;

/** Largest drawn half-height tangent, so very wide views stay compact. */
const CAMERA_COLLABORATION_PRESENCE_HALF_MAXIMUM = 1.2;

/** A frustum vertex. */
type CameraCollaborationVertex = [number, number, number];

/** One remote item drawn by the presence receiver. */
export interface PresenceCollaborationItem {
  readonly object: THREE.Object3D;
  /**
   * Sets the received pose.
   *
   * @param entry Decoded entry.
   * @param now Current time in milliseconds.
   */
  target(entry: PresenceEntry, now: number): void;
  /**
   * Advances interpolation.
   *
   * @param now Current time in milliseconds.
   * @returns True while still moving.
   */
  update(now: number): boolean;
  /** Frees GPU resources. */
  dispose(): void;
}

/**
 * A remote viewport camera: a 3D frustum (with an up marker) in the member
 * color pointing where they look, plus their name tag.
 */
export class CameraCollaborationPresence implements PresenceCollaborationItem {
  readonly object: THREE.Group;
  private readonly gizmo: THREE.Group;
  private readonly lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly lens: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly tag: NametagCollaborationPresence;
  private readonly pose: PoseCollaborationPresence;
  private fov: number;

  /**
   * Creates the gizmo.
   *
   * @param name Display name.
   * @param color Member color.
   */
  constructor(name: string, color: number) {
    this.object = new THREE.Group();
    this.object.name = `Presence camera ${name}`;
    this.gizmo = new THREE.Group();
    this.lines = new THREE.LineSegments(
      cameraCollaborationLinesGeometry(),
      new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false }),
    );
    this.lens = new THREE.Mesh(
      cameraCollaborationLensGeometry(),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: CAMERA_COLLABORATION_PRESENCE_LENS_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.tag = new NametagCollaborationPresence(name, color, {
      world: CAMERA_COLLABORATION_PRESENCE_WORLD * 0.6,
      pixels: 26,
      fade: true,
    });
    this.pose = new PoseCollaborationPresence();
    this.fov = 0;
    this.gizmo.add(this.lines, this.lens);
    this.object.add(this.gizmo, this.tag.sprite);
    this.object.traverse((child) => (child.frustumCulled = false));
    presenceCollaborationTag(this.object);
    this.lines.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer, camera);
    this.lens.onBeforeRender = (renderer, _scene, camera) => this.prepare(renderer, camera);
  }

  /**
   * Sets the received pose and field of view.
   *
   * @param entry Decoded entry.
   * @param now Current time in milliseconds.
   */
  target(entry: PresenceEntry, now: number): void {
    this.pose.target(new THREE.Vector3(...entry.position), new THREE.Quaternion(...entry.quaternion), now);
    if (entry.fov !== this.fov) this.shape(entry.fov);
    this.apply();
  }

  /**
   * Advances interpolation.
   *
   * @param now Current time in milliseconds.
   * @returns True while still moving.
   */
  update(now: number): boolean {
    const moving = this.pose.update(now);
    this.apply();
    return moving;
  }

  /** Frees GPU resources. */
  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.lens.geometry.dispose();
    this.lens.material.dispose();
    this.tag.dispose();
  }

  /** Copies the shown pose to the gizmo and the tag anchor. */
  private apply(): void {
    this.gizmo.position.copy(this.pose.position);
    this.gizmo.quaternion.copy(this.pose.quaternion);
    this.tag.anchor.copy(this.pose.position);
    this.object.updateMatrixWorld(true);
  }

  /**
   * Reshapes the frustum for a field of view.
   *
   * @param fov Vertical field of view in degrees.
   */
  private shape(fov: number): void {
    this.fov = fov;
    const half = Math.min(CAMERA_COLLABORATION_PRESENCE_HALF_MAXIMUM, Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    const lines = this.lines.geometry.getAttribute('position');
    const lens = this.lens.geometry.getAttribute('position');
    cameraCollaborationLinesFill(lines.array as Float32Array, half);
    cameraCollaborationLensFill(lens.array as Float32Array, half);
    lines.needsUpdate = true;
    lens.needsUpdate = true;
  }

  /**
   * Sizes and fades the gizmo for the pane being drawn. Both the lines and the
   * lens call it, so whichever is drawn first in a pane sets them up.
   *
   * @param renderer Renderer.
   * @param camera Pane camera.
   */
  private prepare(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const fade = fadeCollaborationPresenceCamera(camera, this.gizmo.position);
    this.lines.material.opacity = fade;
    this.lens.material.opacity = fade * CAMERA_COLLABORATION_PRESENCE_LENS_OPACITY;
    this.scale(renderer, camera);
  }

  /**
   * Keeps the gizmo readable from afar for the pane being drawn.
   *
   * @param renderer Renderer.
   * @param camera Pane camera.
   */
  private scale(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const perPixel = screenCollaborationWorldPerPixel(renderer, camera, this.gizmo.position);
    const size = Math.max(CAMERA_COLLABORATION_PRESENCE_WORLD, CAMERA_COLLABORATION_PRESENCE_PIXELS * perPixel);
    this.gizmo.scale.setScalar(size);
    this.gizmo.updateMatrixWorld(true);
  }
}

/**
 * Creates the frustum line geometry (unit depth, filled by shape).
 *
 * @returns Geometry.
 */
function cameraCollaborationLinesGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(CAMERA_COLLABORATION_PRESENCE_VERTICES * 3);
  cameraCollaborationLinesFill(positions, Math.tan(Math.PI / 6));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Creates the translucent lens quad geometry.
 *
 * @returns Geometry.
 */
function cameraCollaborationLensGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(6 * 3);
  cameraCollaborationLensFill(positions, Math.tan(Math.PI / 6));
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Returns the four far corners of a unit-depth frustum looking down -Z.
 *
 * @param half Tangent of half the vertical field of view.
 * @returns Corners: bottom left, bottom right, top right, top left.
 */
function cameraCollaborationCorners(
  half: number,
): [CameraCollaborationVertex, CameraCollaborationVertex, CameraCollaborationVertex, CameraCollaborationVertex] {
  const w = half * CAMERA_COLLABORATION_PRESENCE_ASPECT;
  return [
    [-w, -half, -1],
    [w, -half, -1],
    [w, half, -1],
    [-w, half, -1],
  ];
}

/**
 * Writes the frustum edges and the up triangle.
 *
 * @param target Position array (22 vertices).
 * @param half Tangent of half the vertical field of view.
 */
export function cameraCollaborationLinesFill(target: Float32Array, half: number): void {
  const [bl, br, tr, tl] = cameraCollaborationCorners(half);
  const apex: CameraCollaborationVertex = [0, 0, 0];
  const peak: CameraCollaborationVertex = [0, half * 1.6, -1];
  const left: CameraCollaborationVertex = [-half * 0.5, half * 1.1, -1];
  const right: CameraCollaborationVertex = [half * 0.5, half * 1.1, -1];
  const segments = [
    apex,
    bl,
    apex,
    br,
    apex,
    tr,
    apex,
    tl,
    bl,
    br,
    br,
    tr,
    tr,
    tl,
    tl,
    bl,
    left,
    peak,
    peak,
    right,
    right,
    left,
  ];
  segments.forEach((vertex, index) => target.set(vertex, index * 3));
}

/**
 * Writes the lens quad (two triangles over the far rectangle).
 *
 * @param target Position array (6 vertices).
 * @param half Tangent of half the vertical field of view.
 */
export function cameraCollaborationLensFill(target: Float32Array, half: number): void {
  const [bl, br, tr, tl] = cameraCollaborationCorners(half);
  [bl, br, tr, bl, tr, tl].forEach((vertex, index) => target.set(vertex, index * 3));
}
