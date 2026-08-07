import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { EditorPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';
import { buildDefaultPlaneFrame } from '@/navigation/orientation/editor_orientation_basis.js';

/** Default number of minor cells between stronger section lines. */
export const PROJECTED_GRID_SECTION_EVERY = 4;

/** Default number of minor cells between strongest major lines. */
export const PROJECTED_GRID_MAJOR_EVERY = 8;

/** Shared projected-grid uniform dictionary, or null before first build. */
let sharedProjectedGridUniforms: Record<string, THREE.IUniform> | null = null;

/** Whether the projected grid is currently enabled for drawing. */
let sharedProjectedGridVisible = true;

/**
 * Returns the shared projected-grid uniform dictionary, building it on first
 * use.
 *
 * @returns Shared uniform dictionary.
 */
export function getSharedProjectedGridUniforms(): Record<string, THREE.IUniform> {
  if (!sharedProjectedGridUniforms) {
    sharedProjectedGridUniforms = buildSharedProjectedGridUniforms();
  }
  return sharedProjectedGridUniforms;
}

/**
 * Copies shared projected-grid uniform references into a material uniform map.
 *
 * @param target Destination uniform map that receives the shared references.
 */
export function attachSharedProjectedGridUniforms(target: Record<string, THREE.IUniform>): void {
  const shared = getSharedProjectedGridUniforms();
  for (const uniformName of Object.keys(shared)) {
    const uniform = shared[uniformName];
    if (uniform) {
      target[uniformName] = uniform;
    }
  }
}

/**
 * Writes the oriented lattice plane into the shared uniforms.
 *
 * @param frame Grid plane origin and axes.
 */
export function writeSharedProjectedGridPlaneFrame(frame: EditorPlaneFrame): void {
  writeSharedVector3('gridOrigin', frame.origin);
  writeSharedVector3('gridUAxis', frame.uAxis);
  writeSharedVector3('gridVAxis', frame.vAxis);
  writeSharedVector3('gridNormal', frame.normal);
}

/**
 * Writes the minor cell size into the shared uniforms.
 *
 * @param cellSize World units per minor cell.
 */
export function writeSharedProjectedGridCellSize(cellSize: number): void {
  const uniform = getSharedProjectedGridUniforms()['cellSize'];
  if (!uniform) {
    return;
  }
  uniform.value = Math.max(cellSize, 0.001);
}

/**
 * Enables or disables lattice drawing in the shared projected-grid uniforms.
 *
 * @param visible True when the projected grid should draw.
 */
export function writeSharedProjectedGridVisible(visible: boolean): void {
  sharedProjectedGridVisible = visible;
  const uniform = getSharedProjectedGridUniforms()['projectedGridEnabled'];
  if (!uniform) {
    return;
  }
  uniform.value = visible ? 1 : 0;
}

/**
 * Returns whether the shared projected grid is currently enabled for drawing.
 *
 * @returns True when enabled.
 */
export function readSharedProjectedGridVisible(): boolean {
  return sharedProjectedGridVisible;
}

/** Clears the shared uniform dictionary and restores default visibility. */
export function resetSharedProjectedGridUniforms(): void {
  sharedProjectedGridUniforms = null;
  sharedProjectedGridVisible = true;
}

/**
 * Builds the initial shared uniform dictionary for the default floor frame.
 *
 * @returns Fresh uniform map with owned value objects.
 */
function buildSharedProjectedGridUniforms(): Record<string, THREE.IUniform> {
  const frame = buildDefaultPlaneFrame();
  return {
    gridOrigin: { value: frame.origin.clone() },
    gridUAxis: { value: frame.uAxis.clone() },
    gridVAxis: { value: frame.vAxis.clone() },
    gridNormal: { value: frame.normal.clone() },
    cellSize: { value: 0.25 },
    sectionEvery: { value: PROJECTED_GRID_SECTION_EVERY },
    majorEvery: { value: PROJECTED_GRID_MAJOR_EVERY },
    minorColor: { value: createDisplayReferredGridColor(Theme.gridColor) },
    sectionColor: { value: createDisplayReferredGridColor(Theme.gridOriginColor) },
    majorColor: { value: createDisplayReferredGridColor(0x888888) },
    minorAlpha: { value: 0.28 },
    sectionAlpha: { value: 0.42 },
    majorAlpha: { value: 0.55 },
    projectedGridEnabled: { value: 1 },
  };
}

/**
 * Builds a Color whose r/g/b channels match the display-referred hex values
 * without applying sRGB-to-linear conversion.
 *
 * @param hex Display-referred sRGB hex color.
 * @returns Color holding raw display channel values.
 */
function createDisplayReferredGridColor(hex: number): THREE.Color {
  const red = ((hex >> 16) & 255) / 255;
  const green = ((hex >> 8) & 255) / 255;
  const blue = (hex & 255) / 255;
  return new THREE.Color().setRGB(red, green, blue, THREE.ColorManagement.workingColorSpace);
}

/**
 * Copies a world vector into a named shared vec3 uniform.
 *
 * @param uniformName Uniform key.
 * @param value Source vector.
 */
function writeSharedVector3(uniformName: string, value: THREE.Vector3): void {
  const uniform = getSharedProjectedGridUniforms()[uniformName];
  if (!uniform) {
    return;
  }
  const target = uniform.value as THREE.Vector3;
  target.copy(value);
}
