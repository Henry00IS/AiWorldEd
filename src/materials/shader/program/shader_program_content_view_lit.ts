import * as THREE from 'three';
import { CONTENT_VIEW_LIT_AMBIENT } from '@/materials/content_view_lit_constants.js';
import type { ShaderProgramBase } from '../generator/shader_program_base.js';

/** Shader program for distance-independent multi-light studio viewport lighting. */
export class ShaderProgramContentViewLit implements ShaderProgramBase {
  private readonly tint: THREE.Color;
  private readonly map: THREE.Texture;

  /**
   * Stores the diffuse tint color and albedo map for this program.
   *
   * @param tint Diffuse tint color.
   * @param map Albedo texture.
   */
  constructor(tint: THREE.Color, map: THREE.Texture) {
    this.tint = tint;
    this.map = map;
  }

  /**
   * Returns diffuse and map uniforms for this program.
   *
   * @returns Base uniform dictionary.
   */
  baseUniforms(): Record<string, THREE.IUniform> {
    return {
      diffuse: { value: this.tint },
      map: { value: this.map },
    };
  }

  /**
   * Declares view-space normal and UV varyings.
   *
   * @returns Vertex declarations.
   */
  vertexDeclarations(): string {
    return /* glsl */ `
      varying vec3 vViewNormal;
      varying vec2 vUv;
    `;
  }

  /**
   * Writes UV and view-space normal.
   *
   * @returns Vertex main statements.
   */
  vertexMainStatements(): string {
    return /* glsl */ `
      vUv = uv;
      vViewNormal = normalize(normalMatrix * normal);
    `;
  }

  /**
   * Writes clip-space position.
   *
   * @returns Vertex position statements.
   */
  vertexPositionStatements(): string {
    return /* glsl */ `
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    `;
  }

  /**
   * Declares diffuse, map, and view varyings for the fragment stage.
   *
   * @returns Fragment declarations.
   */
  fragmentDeclarations(): string {
    return /* glsl */ `
      uniform vec3 diffuse;
      uniform sampler2D map;
      varying vec3 vViewNormal;
      varying vec2 vUv;
    `;
  }

  /**
   * Returns studio viewport lighting helpers.
   *
   * @returns Fragment helper GLSL.
   */
  fragmentHelperFunctions(): string {
    return buildStudioViewportLightingHelpers();
  }

  /**
   * Samples albedo and multiplies by studio lighting into linearColor.
   *
   * @param linearColorVariableName Output variable name.
   * @returns Fragment statements.
   */
  fragmentComputeLinearColor(linearColorVariableName: string): string {
    return /* glsl */ `
      vec3 normalUnit = normalize(vViewNormal);
      float lit = studioViewportLuminance(normalUnit);
      vec3 ${linearColorVariableName} = lit * texture2D(map, vUv).rgb * diffuse;
    `;
  }

  /**
   * Writes linear lit color through Three.js output encoding.
   *
   * @param linearColorVariableName Final linear albedo variable.
   * @returns Fragment output statements.
   */
  fragmentWriteOutput(linearColorVariableName: string): string {
    return /* glsl */ `
      gl_FragColor = linearToOutputTexel(vec4(${linearColorVariableName}, 1.0));
    `;
  }
}

/**
 * Builds lambert and multi-light studio luminance helpers.
 *
 * @returns Fragment helper GLSL.
 */
function buildStudioViewportLightingHelpers(): string {
  return /* glsl */ `
    float lambertTerm(vec3 normalUnit, vec3 lightUnit) {
      return max(dot(normalUnit, lightUnit), 0.0);
    }

    float studioViewportLuminance(vec3 normalUnit) {
      vec3 keyDir = normalize(vec3(0.45, 0.55, 0.70));
      vec3 fillDir = normalize(vec3(-0.55, 0.28, 0.55));
      vec3 topDir = normalize(vec3(0.08, 0.88, 0.40));
      vec3 headDir = vec3(0.0, 0.0, 1.0);
      float key = lambertTerm(normalUnit, keyDir) * 0.48;
      float fill = lambertTerm(normalUnit, fillDir) * 0.22;
      float top = lambertTerm(normalUnit, topDir) * 0.12;
      float head = lambertTerm(normalUnit, headDir) * 0.20;
      return min(${CONTENT_VIEW_LIT_AMBIENT.toFixed(3)} + key + fill + top + head, 1.0);
    }
  `;
}
