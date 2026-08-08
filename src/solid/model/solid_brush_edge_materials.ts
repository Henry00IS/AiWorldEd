import * as THREE from 'three';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * UserData flag marking a shared brush edge material (must not be disposed per
 * mesh).
 */
export const BRUSH_EDGE_SHARED_MATERIAL_KEY = 'isSharedBrushEdgeMaterial';

/**
 * UserData flag marking operation-colored edges on solid brush previews.
 * Distinct from content decorative edges (white Theme.boxEdgeColor outlines).
 */
export const SOLID_BRUSH_EDGE_USERDATA_KEY = 'isSolidBrushEdge';

/** UserData flag marking materials that support distance fade uniforms. */
export const BRUSH_EDGE_DISTANCE_FADE_KEY = 'brushEdgeDistanceFade';

/** Distance where brush edges begin fading out in the perspective viewport. */
export const BRUSH_EDGE_FADE_NEAR = 28;

/**
 * Distance where brush edges are fully faded and culled in the perspective
 * viewport.
 */
export const BRUSH_EDGE_FADE_FAR = 85;

/** Opacity for depth-tested brush edges (3D). */
export const BRUSH_EDGE_FRONT_OPACITY = 0.88;

/** Near/far values that effectively disable distance fade (ortho, tests). */
const FADE_DISABLED_NEAR = 1e7;

/** Far plane for disabled distance fade. */
const FADE_DISABLED_FAR = 1e8;

/**
 * Vertex shader: projects line verts and computes distance fade for perspective
 * only. Orthographic multi-view panes share these materials; Three.js sets
 * projectionMatrix[2][3] to 0 for ortho and non-zero for perspective, so 2D
 * panes stay fully opaque while 3D still distance-fades.
 */
const EDGE_VERTEX_SHADER = `
  uniform float fadeNear;
  uniform float fadeFar;
  varying float vFade;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    bool isPerspective = projectionMatrix[2][3] != 0.0;
    if (isPerspective) {
      float distanceFromCamera = length(mvPosition.xyz);
      vFade = 1.0 - smoothstep(fadeNear, fadeFar, distanceFromCamera);
    } else {
      vFade = 1.0;
    }
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader: multiplies operation color by distance fade and base
 * opacity.
 */
const EDGE_FRAGMENT_SHADER = `
  uniform vec3 diffuse;
  uniform float opacity;
  varying float vFade;

  void main() {
    float alpha = opacity * vFade;
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(diffuse, alpha);
  }
`;

/**
 * Shared brush edge materials with distance fade for the 3D viewport. One
 * material exists per CSG operation color. Perspective uses depth testing so
 * edges behind solid geometry are not drawn; orthographic multi-view panes
 * disable depth so full wireframes remain readable.
 */
export class SolidBrushEdgeMaterials {
  private static frontByOperation = new Map<SolidOperation, THREE.ShaderMaterial>();
  private static depthOcclusionEnabled = true;
  /** When set, all shared edge materials use this diffuse for one pane pass. */
  private static diffuseOverrideHex: number | null = null;

  /**
   * Returns the shared edge material for a CSG operation.
   *
   * @param operation Brush CSG operation.
   * @returns Shared edge material.
   */
  static getFrontMaterial(operation: SolidOperation): THREE.ShaderMaterial {
    return this.getOrCreate(operation);
  }

  /**
   * Enables depth testing for perspective multi-view panes, or always-on-top
   * edges for orthographic 2D panes. Shared materials are toggled each scissor
   * pass because all panes draw the same world hierarchy.
   *
   * @param enabled True for 3D depth test; false for full-bright 2D edges.
   */
  static setDepthOcclusionEnabled(enabled: boolean): void {
    if (this.depthOcclusionEnabled === enabled) return;
    this.depthOcclusionEnabled = enabled;
    this.frontByOperation.forEach((material) => {
      this.applyDepthMode(material, enabled);
    });
  }

  /**
   * Forces every shared brush edge material to one diffuse color for a 2D Edit
   * Mode pane pass so non-domain brushes read as black wires.
   *
   * @param color Hex color.
   */
  static setDiffuseColorOverrideForRenderPass(color: number): void {
    this.diffuseOverrideHex = color;
    this.applyDiffuseToAllMaterials();
  }

  /**
   * Restores per-operation edge colors after a pane that used a diffuse
   * override.
   */
  static clearDiffuseColorOverrideForRenderPass(): void {
    if (this.diffuseOverrideHex === null) {
      return;
    }
    this.diffuseOverrideHex = null;
    this.applyDiffuseToAllMaterials();
  }

  /**
   * Returns whether shared edge materials currently use depth testing.
   *
   * @returns True when 3D depth testing is enabled.
   */
  static isDepthOcclusionEnabled(): boolean {
    return this.depthOcclusionEnabled;
  }

  /**
   * Returns whether a material is a shared brush edge material.
   *
   * @param material Candidate material.
   * @returns True when dispose paths must skip this material.
   */
  static isSharedMaterial(material: THREE.Material): boolean {
    return material.userData[BRUSH_EDGE_SHARED_MATERIAL_KEY] === true;
  }

  /**
   * Disables distance fade on a material.
   *
   * @param material Line material to update.
   */
  static disableDistanceFade(material: THREE.Material): void {
    if (material.userData[BRUSH_EDGE_DISTANCE_FADE_KEY] !== true) return;
    if (!(material instanceof THREE.ShaderMaterial)) return;
    const fadeNear = material.uniforms['fadeNear'];
    const fadeFar = material.uniforms['fadeFar'];
    if (fadeNear) fadeNear.value = FADE_DISABLED_NEAR;
    if (fadeFar) fadeFar.value = FADE_DISABLED_FAR;
  }

  /**
   * Prepares a brush edge material for orthographic multi-view. Disables
   * distance fade and depth testing so outlines stay visible from every axis
   * even when solid result depth would hide them.
   *
   * @param material Line material to update.
   */
  static prepareForOrthoClone(material: THREE.Material): void {
    this.disableDistanceFade(material);
    if (material.userData[BRUSH_EDGE_DISTANCE_FADE_KEY] !== true) return;
    material.depthTest = false;
    material.depthWrite = false;
    material.depthFunc = THREE.AlwaysDepth;
    material.needsUpdate = true;
  }

  /**
   * Preview edge color for a CSG operation.
   *
   * @param operation Solid operation.
   * @returns Hex color.
   */
  static edgeColorForOperation(operation: SolidOperation): number {
    if (operation === SolidOperation.Subtractive) return 0xff6b5a;
    if (operation === SolidOperation.Intersecting) return 0x5dade2;
    return 0x58d68d;
  }

  /**
   * Gets or creates a shared edge material for an operation.
   *
   * @param operation CSG operation.
   * @returns Shared shader material.
   */
  private static getOrCreate(operation: SolidOperation): THREE.ShaderMaterial {
    const existing = this.frontByOperation.get(operation);
    if (existing) return existing;
    const material = this.createMaterial(operation);
    this.frontByOperation.set(operation, material);
    return material;
  }

  /**
   * Builds one shared distance-faded edge material.
   *
   * @param operation CSG operation for tint.
   * @returns Configured shader material.
   */
  private static createMaterial(operation: SolidOperation): THREE.ShaderMaterial {
    const hex = this.diffuseOverrideHex ?? this.edgeColorForOperation(operation);
    const color = new THREE.Color(hex);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        diffuse: { value: color },
        opacity: { value: BRUSH_EDGE_FRONT_OPACITY },
        fadeNear: { value: BRUSH_EDGE_FADE_NEAR },
        fadeFar: { value: BRUSH_EDGE_FADE_FAR },
      },
      vertexShader: EDGE_VERTEX_SHADER,
      fragmentShader: EDGE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: this.depthOcclusionEnabled,
      depthWrite: false,
      depthFunc: this.depthOcclusionEnabled ? THREE.LessEqualDepth : THREE.AlwaysDepth,
      toneMapped: false,
    });
    material.userData[BRUSH_EDGE_SHARED_MATERIAL_KEY] = true;
    material.userData[BRUSH_EDGE_DISTANCE_FADE_KEY] = true;
    return material;
  }

  /**
   * Applies depth-test settings for 3D occlusion or full-bright 2D.
   *
   * @param material Edge material to update.
   * @param depthOcclusionEnabled Whether 3D depth testing is active.
   */
  private static applyDepthMode(material: THREE.ShaderMaterial, depthOcclusionEnabled: boolean): void {
    material.depthTest = depthOcclusionEnabled;
    material.depthWrite = false;
    material.depthFunc = depthOcclusionEnabled ? THREE.LessEqualDepth : THREE.AlwaysDepth;
    material.needsUpdate = true;
  }

  /** Writes override or per-operation diffuse onto every shared edge material. */
  private static applyDiffuseToAllMaterials(): void {
    this.frontByOperation.forEach((material, operation) => {
      const hex = this.diffuseOverrideHex ?? this.edgeColorForOperation(operation);
      const diffuse = material.uniforms['diffuse'];
      if (diffuse && diffuse.value instanceof THREE.Color) {
        diffuse.value.setHex(hex);
      }
    });
  }
}
