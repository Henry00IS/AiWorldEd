import type * as THREE from 'three';
import {
  PROJECTED_GRID_GRAZING_FADE_FULL,
  PROJECTED_GRID_GRAZING_FADE_HIDE,
  PROJECTED_GRID_LINE_CORE_FRACTION,
  PROJECTED_GRID_LINE_WIDTH_PIXELS,
  PROJECTED_GRID_MAJOR_FADE_FULL_PX,
  PROJECTED_GRID_MAJOR_FADE_HIDE_PX,
  PROJECTED_GRID_MIN_AXIS_DERIVATIVE,
  PROJECTED_GRID_MINOR_FADE_FULL_PX,
  PROJECTED_GRID_MINOR_FADE_HIDE_PX,
  PROJECTED_GRID_SECTION_FADE_FULL_PX,
  PROJECTED_GRID_SECTION_FADE_HIDE_PX,
} from '@/viewports/grid/projected/projected_grid_math.js';
import type { ShaderChunk } from './shader_chunk.js';
import { attachSharedProjectedGridUniforms } from '../uniform/uniform_projected_grid_shared.js';

/**
 * Projected surface lattice as a reusable shader chunk. Any editor pass that
 * needs the Sabre-style grid includes this chunk once; uniforms are shared.
 */
export class ShaderChunkProjectedGrid implements ShaderChunk {
  readonly chunkId = 'projected_grid';

  /**
   * Attaches the shared projected-grid uniforms by reference.
   *
   * @param target Uniform dictionary being assembled.
   */
  collectUniforms(target: Record<string, THREE.IUniform>): void {
    attachSharedProjectedGridUniforms(target);
  }

  /**
   * Returns vertex-stage GLSL that declares world-space position and normal
   * varyings.
   *
   * @returns Vertex declaration GLSL.
   */
  vertexDeclarations(): string {
    return /* glsl */ `
      varying vec3 vProjectedGridWorldPosition;
      varying vec3 vProjectedGridWorldNormal;
    `;
  }

  /**
   * Writes world position and normal for triplanar lattice projection.
   *
   * @returns Vertex main statements.
   */
  vertexMainStatements(): string {
    return /* glsl */ `
      vec4 projectedGridWorldPosition = modelMatrix * vec4(position, 1.0);
      vProjectedGridWorldPosition = projectedGridWorldPosition.xyz;
      vProjectedGridWorldNormal = normalize(mat3(modelMatrix) * normal);
    `;
  }

  /**
   * Declares projected-grid uniforms in the fragment stage.
   *
   * @returns Fragment uniform declarations.
   */
  fragmentDeclarations(): string {
    return /* glsl */ `
      uniform vec3 gridOrigin;
      uniform vec3 gridUAxis;
      uniform vec3 gridVAxis;
      uniform vec3 gridNormal;
      uniform float cellSize;
      uniform float sectionEvery;
      uniform float majorEvery;
      uniform vec3 minorColor;
      uniform vec3 sectionColor;
      uniform vec3 majorColor;
      uniform float minorAlpha;
      uniform float sectionAlpha;
      uniform float majorAlpha;
      uniform float projectedGridEnabled;
      varying vec3 vProjectedGridWorldPosition;
      varying vec3 vProjectedGridWorldNormal;
    `;
  }

  /**
   * Returns lattice evaluation helpers (axis masks and dominant-axis UVs).
   *
   * @returns Fragment helper function GLSL.
   */
  fragmentHelperFunctions(): string {
    return buildProjectedGridFragmentHelpers();
  }

  /**
   * Returns no linear-albedo modifications.
   *
   * @param _linearColorVariableName Unused linear albedo variable name.
   * @returns Empty string.
   */
  fragmentModifyLinearColor(_linearColorVariableName: string): string {
    return '';
  }

  /**
   * Src-over lattice blend on encoded framebuffer RGB only where the line mask
   * is visible. Line color is contrast-adapted to the surface so dark textures
   * keep a readable lattice.
   *
   * @param outputRgbVariableName Display RGB l-value (e.g. gl_FragColor.rgb).
   * @returns Fragment statements that may modify encoded RGB.
   */
  fragmentModifyEncodedColor(outputRgbVariableName: string): string {
    return /* glsl */ `
      if (projectedGridEnabled > 0.5) {
        vec4 projectedGridSample = evaluateProjectedGridLineColor(
          vProjectedGridWorldPosition,
          vProjectedGridWorldNormal
        );
        if (projectedGridSample.a > 0.01) {
          vec3 adaptiveLineColor = projectedGridAdaptiveLineColor(
            ${outputRgbVariableName},
            projectedGridSample.rgb
          );
          float adaptiveAlpha = projectedGridAdaptiveLineAlpha(
            ${outputRgbVariableName},
            adaptiveLineColor,
            projectedGridSample.a
          );
          ${outputRgbVariableName} = mix(
            ${outputRgbVariableName},
            adaptiveLineColor,
            adaptiveAlpha
          );
        }
      }
    `;
  }
}

/** Singleton chunk instance for content and future editor passes. */
export const SHADER_CHUNK_PROJECTED_GRID = new ShaderChunkProjectedGrid();

/**
 * Builds the fragment helper functions for the projected lattice.
 *
 * @returns GLSL function source.
 */
function buildProjectedGridFragmentHelpers(): string {
  const lineWidthPixels = PROJECTED_GRID_LINE_WIDTH_PIXELS.toFixed(3);
  const coreFraction = PROJECTED_GRID_LINE_CORE_FRACTION.toFixed(3);
  const minAxisDerivative = PROJECTED_GRID_MIN_AXIS_DERIVATIVE.toFixed(6);
  const minorHide = PROJECTED_GRID_MINOR_FADE_HIDE_PX.toFixed(3);
  const minorFull = PROJECTED_GRID_MINOR_FADE_FULL_PX.toFixed(3);
  const sectionHide = PROJECTED_GRID_SECTION_FADE_HIDE_PX.toFixed(3);
  const sectionFull = PROJECTED_GRID_SECTION_FADE_FULL_PX.toFixed(3);
  const majorHide = PROJECTED_GRID_MAJOR_FADE_HIDE_PX.toFixed(3);
  const majorFull = PROJECTED_GRID_MAJOR_FADE_FULL_PX.toFixed(3);
  const grazingHide = PROJECTED_GRID_GRAZING_FADE_HIDE.toFixed(3);
  const grazingFull = PROJECTED_GRID_GRAZING_FADE_FULL.toFixed(3);
  return /* glsl */ `
    float projectedGridDistanceToLine(float worldAlongAxis, float period) {
      float safePeriod = max(period, 1e-6);
      float halfPeriod = safePeriod * 0.5;
      float centered = mod(worldAlongAxis + halfPeriod, safePeriod) - halfPeriod;
      return abs(centered);
    }

    float projectedGridAxisDerivative(float worldAlongAxis) {
      return max(length(vec2(dFdx(worldAlongAxis), dFdy(worldAlongAxis))), ${minAxisDerivative});
    }

    float projectedGridAxisLineMask(float worldAlongAxis, float period, float axisDerivative) {
      float safePeriod = max(period, 1e-6);
      float distanceToLine = projectedGridDistanceToLine(worldAlongAxis, safePeriod);
      float halfWidth = max(axisDerivative * ${lineWidthPixels}, axisDerivative * 0.5);
      halfWidth = min(halfWidth, safePeriod * 0.45);
      float coreWidth = halfWidth * ${coreFraction};
      return 1.0 - smoothstep(coreWidth, halfWidth, distanceToLine);
    }

    float projectedGridLatticeMask(vec2 faceUv, float period) {
      float derivX = projectedGridAxisDerivative(faceUv.x);
      float derivY = projectedGridAxisDerivative(faceUv.y);
      float stableX = max(derivX, derivY * 0.35);
      float stableY = max(derivY, derivX * 0.35);
      float lineX = projectedGridAxisLineMask(faceUv.x, period, stableX);
      float lineY = projectedGridAxisLineMask(faceUv.y, period, stableY);
      return clamp(lineX + lineY - lineX * lineY, 0.0, 1.0);
    }

    float projectedGridPixelsPerPeriod(vec2 faceUv, float period) {
      float deriv = max(projectedGridAxisDerivative(faceUv.x), projectedGridAxisDerivative(faceUv.y));
      return max(period, 1e-6) / max(deriv, 1e-6);
    }

    float projectedGridLayerScreenFade(float pixelsPerPeriod, float hideBelow, float fullAbove) {
      return smoothstep(hideBelow, fullAbove, pixelsPerPeriod);
    }

    float projectedGridGrazingFade(vec3 worldPosition, vec3 worldNormal) {
      vec3 viewDir = normalize(cameraPosition - worldPosition);
      float normalDotView = abs(dot(normalize(worldNormal), viewDir));
      return smoothstep(${grazingHide}, ${grazingFull}, normalDotView);
    }

    vec2 projectedGridFaceUv(vec3 localPoint, vec3 localNormalAbs) {
      if (localNormalAbs.x >= localNormalAbs.y && localNormalAbs.x >= localNormalAbs.z) {
        return localPoint.zy;
      }
      if (localNormalAbs.y >= localNormalAbs.x && localNormalAbs.y >= localNormalAbs.z) {
        return localPoint.xz;
      }
      return localPoint.xy;
    }

    float projectedGridLuminance(vec3 rgb) {
      return dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    }

    vec3 projectedGridAdaptiveLineColor(vec3 surfaceRgb, vec3 themeLineRgb) {
      float surfaceLuma = projectedGridLuminance(surfaceRgb);
      vec3 lightLine = mix(themeLineRgb, vec3(0.84, 0.84, 0.86), 0.78);
      vec3 darkLine = mix(themeLineRgb, vec3(0.09, 0.09, 0.10), 0.62);
      return mix(lightLine, darkLine, smoothstep(0.28, 0.52, surfaceLuma));
    }

    float projectedGridAdaptiveLineAlpha(vec3 surfaceRgb, vec3 lineRgb, float baseAlpha) {
      float surfaceLuma = projectedGridLuminance(surfaceRgb);
      float lineLuma = projectedGridLuminance(lineRgb);
      float contrast = abs(surfaceLuma - lineLuma);
      float boost = mix(1.4, 1.0, smoothstep(0.08, 0.28, contrast));
      return clamp(baseAlpha * boost, 0.0, 0.92);
    }

    vec4 evaluateProjectedGridLineColor(vec3 worldPosition, vec3 worldNormal) {
      float safeCell = max(cellSize, 1e-6);
      vec3 delta = worldPosition - gridOrigin;
      vec3 localPoint = vec3(
        dot(delta, gridUAxis),
        dot(delta, gridVAxis),
        dot(delta, gridNormal)
      );
      vec3 localNormalAbs = abs(vec3(
        dot(worldNormal, gridUAxis),
        dot(worldNormal, gridVAxis),
        dot(worldNormal, gridNormal)
      ));
      vec2 faceUv = projectedGridFaceUv(localPoint, localNormalAbs);
      float sectionPeriod = safeCell * max(sectionEvery, 1.0);
      float majorPeriod = safeCell * max(majorEvery, 1.0);
      float grazingFade = projectedGridGrazingFade(worldPosition, worldNormal);
      float minorFade = projectedGridLayerScreenFade(
        projectedGridPixelsPerPeriod(faceUv, safeCell),
        ${minorHide},
        ${minorFull}
      ) * grazingFade;
      float sectionFade = projectedGridLayerScreenFade(
        projectedGridPixelsPerPeriod(faceUv, sectionPeriod),
        ${sectionHide},
        ${sectionFull}
      ) * grazingFade;
      float majorFade = projectedGridLayerScreenFade(
        projectedGridPixelsPerPeriod(faceUv, majorPeriod),
        ${majorHide},
        ${majorFull}
      ) * grazingFade;
      float minorMask = projectedGridLatticeMask(faceUv, safeCell) * minorFade;
      float sectionMask = projectedGridLatticeMask(faceUv, sectionPeriod) * sectionFade;
      float majorMask = projectedGridLatticeMask(faceUv, majorPeriod) * majorFade;
      float majorStrength = majorMask;
      float sectionStrength = max(sectionMask - majorStrength, 0.0);
      float minorStrength = max(minorMask - sectionMask, 0.0);
      vec3 color =
        majorColor * majorStrength +
        sectionColor * sectionStrength +
        minorColor * minorStrength;
      float alpha =
        majorAlpha * majorStrength +
        sectionAlpha * sectionStrength +
        minorAlpha * minorStrength;
      return vec4(color, alpha);
    }
  `;
}
