import * as THREE from 'three';

/**
 * Shared visual constants for Move, Rotate, and Scale gizmos.
 * Keeps stem thickness, tip sizes, and material behavior consistent.
 */
export const GizmoVisualStyle = {
  /** Cylinder radius used by move stems, scale stems, and rotate ring tubes. */
  stemRadius: 0.045,
  /** Length of the move arrow stem cylinder. */
  moveStemLength: 1.65,
  /** Cone radius of the move arrow head. */
  moveHeadRadius: 0.11,
  /** Cone height of the move arrow head. */
  moveHeadLength: 0.38,
  /** Length of the scale stem cylinder. */
  scaleStemLength: 1.65,
  /** Edge length of the scale tip cube. */
  scaleTipSize: 0.18,
  /** Major radius of rotate rings. */
  ringRadius: 1.75,
  /** Opacity of gizmo parts in front of scene geometry. */
  frontOpacity: 0.95,
  /** Opacity of gizmo parts occluded by scene geometry. */
  occludedOpacity: 0.2,
  /** Render order for occluded ghost meshes (drawn first). */
  occludedRenderOrder: 998,
  /** Render order for front gizmo meshes. */
  frontRenderOrder: 999
} as const;

/**
 * Creates the solid front-facing gizmo material with depth testing.
 * Parts behind scene objects fail the depth test and are not drawn with this material.
 * @param color Hex color for the material.
 * @returns Configured MeshBasicMaterial.
 */
export function createGizmoFrontMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    transparent: true,
    opacity: GizmoVisualStyle.frontOpacity,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}

/**
 * Creates a ghost material that only draws where the gizmo is behind scene geometry.
 * Produces the semi-transparent "see through object" look for occluded parts.
 * @param color Hex color for the material.
 * @returns Configured MeshBasicMaterial.
 */
export function createGizmoOccludedMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    transparent: true,
    opacity: GizmoVisualStyle.occludedOpacity,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}

/**
 * Builds a semi-transparent ghost mesh that shares geometry with a front mesh.
 * @param geometry Shared geometry instance.
 * @param color Hex color matching the front mesh.
 * @param handleId Optional handle id copied onto the ghost for picking.
 * @returns The occluded ghost mesh.
 */
export function createGizmoOccludedMesh(
  geometry: THREE.BufferGeometry,
  color: number,
  handleId?: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createGizmoOccludedMaterial(color));
  mesh.renderOrder = GizmoVisualStyle.occludedRenderOrder;
  mesh.userData.isGizmoOccludedGhost = true;
  if (handleId !== undefined) {
    mesh.userData.handleId = handleId;
  }
  return mesh;
}

/**
 * Applies the standard front render order to a gizmo mesh.
 * @param mesh The front mesh to configure.
 */
export function applyGizmoFrontRenderOrder(mesh: THREE.Mesh): void {
  mesh.renderOrder = GizmoVisualStyle.frontRenderOrder;
}

/**
 * Creates a front-facing vertex-colored line material with depth testing.
 * Segments behind scene geometry fail the depth test and are not drawn.
 * @returns Configured line material for unoccluded gizmo lines.
 */
export function createGizmoFrontLineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    transparent: true,
    opacity: GizmoVisualStyle.frontOpacity,
    toneMapped: false,
    linewidth: 1
  });
}

/**
 * Creates a ghost line material that only draws behind scene geometry.
 * Produces the semi-transparent "see through object" look for occluded lines.
 * @returns Configured line material for occluded gizmo lines.
 */
export function createGizmoOccludedLineMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    transparent: true,
    opacity: GizmoVisualStyle.occludedOpacity,
    toneMapped: false,
    linewidth: 1
  });
}
