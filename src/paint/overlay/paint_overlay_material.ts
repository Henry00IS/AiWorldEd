import * as THREE from 'three';
import { buildStudioViewportLightingHelpers } from '@/materials/shader/program/shader_program_content_view_lit.js';

/** Which half of the affine map a pass draws. */
export type PaintOverlayPass = 'multiply' | 'add';

const PAINT_OVERLAY_VERTEX = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Builds the fragment shader of a pass. The multiply pass scales what the
 * surface already shows by A; the add pass adds B lit like the surface, so the
 * screen shows (base · A + B) under the same studio light.
 *
 * @param pass Pass.
 * @returns GLSL.
 */
function paintOverlayFragment(pass: PaintOverlayPass): string {
  const body =
    pass === 'multiply'
      ? 'gl_FragColor = vec4(texture2D(atlas, vUv).rgb, 1.0);'
      : `float lit = studioViewportLuminance(normalize(vViewNormal));
         vec3 encodedLight = linearToOutputTexel(vec4(vec3(lit), 1.0)).rgb;
         gl_FragColor = vec4(texture2D(atlas, vUv + vec2(0.5, 0.0)).rgb * encodedLight, 1.0);`;
  return /* glsl */ `
    uniform sampler2D atlas;
    varying vec3 vViewNormal;
    varying vec2 vUv;
    ${buildStudioViewportLightingHelpers()}
    void main() {
      ${body}
    }
  `;
}

/**
 * Creates the material of one overlay pass for one atlas page.
 *
 * @param pass Pass.
 * @param atlas Page texture.
 * @returns Material.
 */
export function paintOverlayMaterialCreate(pass: PaintOverlayPass, atlas: THREE.Texture): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: pass === 'multiply' ? 'Paint Overlay Multiply' : 'Paint Overlay Add',
    uniforms: { atlas: { value: atlas } },
    vertexShader: PAINT_OVERLAY_VERTEX,
    fragmentShader: paintOverlayFragment(pass),
    lights: false,
    toneMapped: false,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: pass === 'multiply' ? THREE.ZeroFactor : THREE.OneFactor,
    blendDst: pass === 'multiply' ? THREE.SrcColorFactor : THREE.OneFactor,
  });
  return material;
}
