import * as THREE from 'three';
import type { DecalProjectorSettings } from '@/decal/settings/decal_projector_settings.js';

/** Vertex program: passes image coordinates and the view-space normal. */
const DECAL_PRESENTATION_VERTEX_SHADER = /* glsl */ `
varying vec2 decalImageCoordinate;
varying vec3 decalViewNormal;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  decalImageCoordinate = uv;
  decalViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

/**
 * Fragment program: the image lit like level content, with image alpha. Image
 * coordinates outside the image, which unfolded stickers reach, draw nothing.
 */
const DECAL_PRESENTATION_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D decalImage;
uniform float decalOpacity;
varying vec2 decalImageCoordinate;
varying vec3 decalViewNormal;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  if (any(lessThan(decalImageCoordinate, vec2(0.0))) || any(greaterThan(decalImageCoordinate, vec2(1.0)))) discard;
  vec4 texel = texture2D(decalImage, decalImageCoordinate);
  float facing = min(0.02 + abs(normalize(decalViewNormal).z), 1.0);
  float alpha = texel.a * decalOpacity;
  if (alpha <= 0.002) discard;
  gl_FragColor = linearToOutputTexel(vec4(texel.rgb * facing, alpha));
}
`;

/** First render order used by decal presentations, above level content. */
export const DECAL_PRESENTATION_RENDER_ORDER_BASE = 2000;

/**
 * See-through material of a decal presentation. It never writes depth, so
 * overlapping decals blend in render order instead of fighting for depth.
 */
export class DecalPresentationMaterial extends THREE.ShaderMaterial {
  /**
   * Creates the material for one decal.
   *
   * @param image Image texture.
   */
  constructor(image: THREE.Texture) {
    super({
      uniforms: {
        decalImage: { value: image },
        decalOpacity: { value: 1 },
      },
      vertexShader: DECAL_PRESENTATION_VERTEX_SHADER,
      fragmentShader: DECAL_PRESENTATION_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.name = 'decal_presentation';
  }

  /**
   * Applies a decal's appearance settings.
   *
   * @param settings Normalized decal settings.
   * @param image Image texture for the settings' texture id.
   */
  appearanceApply(settings: DecalProjectorSettings, image: THREE.Texture): void {
    this.uniformValueSet('decalImage', image);
    this.uniformValueSet('decalOpacity', settings.opacity);
    this.depthBiasApply(settings.mode === 'projector');
  }

  /**
   * Turns the depth bias toward the camera on or off. Projected decals lie
   * exactly on their surfaces and need it; lifted surface meshes do not.
   *
   * @param enabled True to pull the decal toward the camera in depth.
   */
  private depthBiasApply(enabled: boolean): void {
    if (this.polygonOffset === enabled) return;
    this.polygonOffset = enabled;
    this.polygonOffsetFactor = enabled ? -1 : 0;
    this.polygonOffsetUnits = enabled ? -4 : 0;
    this.needsUpdate = true;
  }

  /**
   * Stores a uniform value.
   *
   * @param name Uniform name.
   * @param value New value.
   */
  private uniformValueSet(name: string, value: unknown): void {
    const uniform = this.uniforms[name];
    if (uniform) uniform.value = value;
  }
}
