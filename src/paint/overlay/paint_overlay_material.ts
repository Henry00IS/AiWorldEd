import * as THREE from 'three';
import { buildStudioViewportLightingHelpers } from '@/materials/shader/program/shader_program_content_view_lit.js';
import { PAINT_ATLAS_MIP_LEVEL_MAX } from '@/paint/paint_constants.js';

/** Which half of the affine map a pass draws. */
export type PaintOverlayPass = 'multiply' | 'add';

const PAINT_OVERLAY_VERTEX = /* glsl */ `
  varying vec3 vViewNormal;
  centroid varying vec2 vUv;
  varying vec2 vUvLod;
  void main() {
    vUv = uv;
    vUvLod = uv;
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
      ? 'gl_FragColor = vec4(paintAtlasSample(vUv).rgb, 1.0);'
      : `float lit = studioViewportLuminance(normalize(vViewNormal));
         vec3 encodedLight = linearToOutputTexel(vec4(vec3(lit), 1.0)).rgb;
         gl_FragColor = vec4(paintAtlasSample(vUv + vec2(0.5, 0.0)).rgb * encodedLight, 1.0);`;
  return /* glsl */ `
    uniform sampler2D atlas;
    varying vec3 vViewNormal;
    // Sampled at a point the triangle covers: with multisampling, an edge pixel
    // whose center lies outside its small tile piece would otherwise read
    // atlas coordinates extrapolated past the slot.
    centroid varying vec2 vUv;
    // The mip level comes from the plain coordinates, whose derivatives are
    // smooth across the triangle.
    varying vec2 vUvLod;
    ${buildStudioViewportLightingHelpers()}
    // Trilinear like the hardware, but never coarser than the capped level,
    // whose mip texels the slot gutters are sized for. Both passes use the
    // derivatives of vUvLod, so A and B always come from the same level.
    vec4 paintAtlasSample(vec2 uv) {
      vec2 texel = vUvLod * vec2(textureSize(atlas, 0));
      vec2 dx = dFdx(texel);
      vec2 dy = dFdy(texel);
      float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-8));
      return textureLod(atlas, uv, clamp(lod, 0.0, ${PAINT_ATLAS_MIP_LEVEL_MAX.toFixed(1)}));
    }
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
