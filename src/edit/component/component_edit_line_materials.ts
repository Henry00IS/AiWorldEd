import * as THREE from 'three';
import { Theme } from '@/theme.js';

/** Selection orange for edit lines (same accent as object-mode selection). */
export const EDIT_LINE_SELECTED_COLOR = Theme.selectionColor;

/** Unselected cage wire in perspective (3D). */
export const EDIT_LINE_CAGE_COLOR_3D = 0x000000;

/** Unselected cage wire in orthographic (2D). */
export const EDIT_LINE_CAGE_COLOR_2D = 0xffffff;

/** Shared material flag so dispose paths can skip global instances. */
export const EDIT_LINE_SHARED_MATERIAL_KEY = 'isEditLineSharedMaterial';

/**
 * Line style encoded in the material. 0 = cage (black/white by view), 1 = solid
 * selected orange, 2 = half-edge gradient (orange → black/white by view).
 */
export type EditLineStyleMode = 0 | 1 | 2;

/**
 * Vertex shader: projects lines, passes fadeT, and detects orthographic cameras
 * the same way brush edge materials do (projectionMatrix[2][3] == 0 for
 * ortho).
 */
const EDIT_LINE_VERTEX_SHADER = `
  attribute float fadeT;
  varying float vFadeT;
  varying float vIsOrthographic;

  void main() {
    vFadeT = fadeT;
    vIsOrthographic = projectionMatrix[2][3] == 0.0 ? 1.0 : 0.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader: picks cage / solid / gradient colors from the active camera
 * projection so multi-view panes need no CPU recoloring. Colors are authored in
 * sRGB (matching Theme hex) and written as-is so they match LineBasicMaterial
 * selection orange without linear color-management darkening.
 */
const EDIT_LINE_FRAGMENT_SHADER = `
  uniform vec3 selectedColor;
  uniform vec3 cageColor3d;
  uniform vec3 cageColor2d;
  uniform float opacity;
  uniform float styleMode;
  varying float vFadeT;
  varying float vIsOrthographic;

  void main() {
    vec3 viewCageColor = mix(cageColor3d, cageColor2d, vIsOrthographic);
    vec3 color = selectedColor;
    if (styleMode < 0.5) {
      color = viewCageColor;
    } else if (styleMode > 1.5) {
      color = mix(selectedColor, viewCageColor, vFadeT);
    }
    gl_FragColor = vec4(color, opacity);
  }
`;

/**
 * Shared ShaderMaterials for Edit Mode cage and selection lines. Orthographic
 * vs perspective appearance is decided in the fragment shader from the active
 * camera projection.
 */
export class ComponentEditLineMaterials {
  private static cageMaterial: THREE.ShaderMaterial | null = null;
  private static solidSelectedMaterial: THREE.ShaderMaterial | null = null;
  private static halfSelectedMaterial: THREE.ShaderMaterial | null = null;

  /**
   * Returns the shared unselected cage wire material (black in 3D, white in
   * 2D).
   *
   * @returns Shared cage line material.
   */
  static getCageMaterial(): THREE.ShaderMaterial {
    if (!this.cageMaterial) {
      this.cageMaterial = this.createMaterial(0, 0.9);
    }
    return this.cageMaterial;
  }

  /**
   * Returns the shared solid selected-edge material (dark orange).
   *
   * @returns Shared solid selection line material.
   */
  static getSolidSelectedMaterial(): THREE.ShaderMaterial {
    if (!this.solidSelectedMaterial) {
      this.solidSelectedMaterial = this.createMaterial(1, 1);
    }
    return this.solidSelectedMaterial;
  }

  /**
   * Returns the shared half-selected edge material (orange→black/white by
   * view).
   *
   * @returns Shared half-edge gradient line material.
   */
  static getHalfSelectedMaterial(): THREE.ShaderMaterial {
    if (!this.halfSelectedMaterial) {
      this.halfSelectedMaterial = this.createMaterial(2, 1);
    }
    return this.halfSelectedMaterial;
  }

  /**
   * Returns whether a material is a shared edit-line material.
   *
   * @param material Candidate material.
   * @returns True when the material must not be disposed per overlay.
   */
  static isSharedMaterial(material: THREE.Material): boolean {
    return material.userData[EDIT_LINE_SHARED_MATERIAL_KEY] === true;
  }

  /**
   * Builds one shared edit line material.
   *
   * @param styleMode 0 cage, 1 solid selected, 2 half gradient.
   * @param opacity Line opacity.
   * @returns Configured shader material.
   */
  private static createMaterial(styleMode: EditLineStyleMode, opacity: number): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        selectedColor: { value: hexToSrgbVector(EDIT_LINE_SELECTED_COLOR) },
        cageColor3d: { value: hexToSrgbVector(EDIT_LINE_CAGE_COLOR_3D) },
        cageColor2d: { value: hexToSrgbVector(EDIT_LINE_CAGE_COLOR_2D) },
        opacity: { value: opacity },
        styleMode: { value: styleMode },
      },
      vertexShader: EDIT_LINE_VERTEX_SHADER,
      fragmentShader: EDIT_LINE_FRAGMENT_SHADER,
      transparent: opacity < 1,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    material.userData[EDIT_LINE_SHARED_MATERIAL_KEY] = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -8;
    material.polygonOffsetUnits = -8;
    return material;
  }
}

/**
 * Converts a theme hex color to an sRGB 0–1 vector without Three.js linear
 * working-space conversion (ShaderMaterial would otherwise display orange as
 * dark red under color management).
 *
 * @param hex 0xRRGGBB theme color.
 * @returns RGB vector in display sRGB.
 */
function hexToSrgbVector(hex: number): THREE.Vector3 {
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}
