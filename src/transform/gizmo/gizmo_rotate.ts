import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { GizmoAxis } from '@/types/transform_mode.js';
import { GizmoHandle } from './gizmo_handle.js';
import { GizmoBuilderBase } from './gizmo_builder_base.js';
import {
  GizmoVisualStyle,
  GIZMO_FREE_ROTATE_DISC_PICK_USERDATA,
  GIZMO_PRESERVE_OPACITY_USERDATA,
  GIZMO_SCALE_FREE_BILLBOARD_USERDATA,
  createGizmoOccludedMesh,
  createGizmoPickMesh,
} from './gizmo_visual_style.js';
import { tagGizmoDepthRole } from './gizmo_depth_style.js';

/**
 * Creates the rotate transform gizmo with thin axis rings, thicker pick tori,
 * and a camera-facing free-rotate billboard disc.
 */
export class GizmoRotate extends GizmoBuilderBase {
  /**
   * Creates a new rotate gizmo builder.
   *
   * @param theme The theme containing gizmo color definitions.
   */
  constructor(theme: typeof Theme) {
    super(theme);
  }

  /**
   * Creates three axis rings plus a free-rotate VIEW billboard disc.
   *
   * @returns GizmoHandle instances for X, Y, Z, and VIEW.
   */
  createHandles(): GizmoHandle[] {
    this.beginHandleBuild();
    for (const spec of this.listStandardAxisSpecs()) {
      this.createRing(spec.axis, spec.color, spec.direction);
    }
    this.createFreeRotateBillboard();
    return this.handles;
  }

  /**
   * Creates a single ring handle with front, occluded ghost, and pick meshes.
   *
   * @param axis The gizmo axis for this ring.
   * @param color The hex color of the ring.
   * @param axisDirection The direction vector of the rotation axis.
   */
  private createRing(axis: GizmoAxis, color: number, axisDirection: THREE.Vector3): void {
    const group = new THREE.Group();
    const geometry = new THREE.TorusGeometry(GizmoVisualStyle.ringRadius, GizmoVisualStyle.stemRadius, 12, 64);
    const frontMesh = this.createFrontMesh(geometry, color);
    const handle = new GizmoHandle(axis, color, frontMesh);
    this.attachRingMeshes(group, geometry, frontMesh, color, handle.getHandleId());
    this.alignGroupLocalZToDirection(group, axisDirection);
    this.registerSceneRoot(group);
    this.registerHandle(handle);
  }

  /**
   * Tags the front mesh and adds ghost plus thick pick torus under the ring
   * group.
   *
   * @param group Ring handle group.
   * @param geometry Shared torus geometry for front and ghost.
   * @param frontMesh Visible front ring.
   * @param color Axis color.
   * @param handleId Shared handle id.
   */
  private attachRingMeshes(
    group: THREE.Group,
    geometry: THREE.BufferGeometry,
    frontMesh: THREE.Mesh,
    color: number,
    handleId: number,
  ): void {
    this.tagHandleId(frontMesh, handleId);
    group.add(
      createGizmoPickMesh(
        new THREE.TorusGeometry(GizmoVisualStyle.ringRadius, GizmoVisualStyle.ringPickTubeRadius, 10, 48),
        handleId,
      ),
    );
    group.add(createGizmoOccludedMesh(geometry, color, handleId));
    group.add(frontMesh);
  }

  /**
   * Creates the camera-facing free-rotate disc (VIEW). Drawn in front of scene
   * geometry and behind front axis rings; screen-space rotation when dragged.
   */
  private createFreeRotateBillboard(): void {
    const billboard = new THREE.Group();
    billboard.name = 'gizmo_rotate_free_billboard';
    billboard.userData[GIZMO_SCALE_FREE_BILLBOARD_USERDATA] = true;
    const radius = GizmoVisualStyle.rotateFreeBillboardRadius;
    const color = this.theme.gizmoCenterColor;
    const discGeometry = new THREE.CircleGeometry(radius, 48);
    const discMesh = this.createFreeRotateBillboardMesh(discGeometry, color);
    const handle = new GizmoHandle(GizmoAxis.VIEW, color, discMesh);
    handle.setHoverColorValue(this.brightenColor(color, 0.28));
    const handleId = handle.getHandleId();
    this.tagHandleId(discMesh, handleId);
    discMesh.userData[GIZMO_FREE_ROTATE_DISC_PICK_USERDATA] = true;
    const pick = createGizmoPickMesh(new THREE.CircleGeometry(radius, 48), handleId);
    pick.userData[GIZMO_FREE_ROTATE_DISC_PICK_USERDATA] = true;
    billboard.add(pick);
    billboard.add(discMesh);
    this.registerSceneRoot(billboard);
    this.registerHandle(handle);
  }

  /**
   * Builds the filled free-rotate disc visual (always on top of scene geometry,
   * render order below front rings). Uses always-on-top depth role so 3D panes
   * do not re-enable depth testing on the material each frame.
   *
   * @param geometry Circle geometry.
   * @param color Disc tint.
   * @returns Billboard disc mesh.
   */
  private createFreeRotateBillboardMesh(geometry: THREE.BufferGeometry, color: number): THREE.Mesh {
    const opacity = GizmoVisualStyle.rotateFreeBillboardOpacity;
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    tagGizmoDepthRole(material, 'always_on_top');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = GizmoVisualStyle.rotateFreeBillboardRenderOrder;
    mesh.userData[GIZMO_PRESERVE_OPACITY_USERDATA] = opacity;
    return mesh;
  }

  /**
   * Lerps a hex color toward white for a subtle active/hover brighten.
   *
   * @param hex Base color.
   * @param amount Blend toward white (0–1).
   * @returns Brightened hex color.
   */
  private brightenColor(hex: number, amount: number): number {
    const color = new THREE.Color(hex);
    color.lerp(new THREE.Color(0xffffff), amount);
    return color.getHex();
  }
}
