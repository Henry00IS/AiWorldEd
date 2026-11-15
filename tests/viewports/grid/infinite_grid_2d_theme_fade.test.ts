import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { InfiniteGrid2D } from '@/viewports/grid/infinite_grid_2d.js';
import { UI_THEME_ATTRIBUTE } from '@/ui/theme/theme_ui_palette.js';

/** One drawn grid segment with its endpoint heights and colors. */
interface GridSegment {
  startY: number;
  endY: number;
  startColor: THREE.Color;
  endColor: THREE.Color;
}

/**
 * Builds a zoomed-out front camera where 0.25 cells sit about ten reference
 * pixels apart.
 *
 * @returns Updated orthographic camera.
 */
function zoomedOutCameraCreate(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Renders the grid for the given theme and returns every segment.
 *
 * @param themeId Theme applied to the document root.
 * @returns Segments in buffer order.
 */
function segmentsForTheme(themeId: 'light' | 'dark'): GridSegment[] {
  document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, themeId);
  const grid = new InfiniteGrid2D('xy', 0.25);
  grid.update(zoomedOutCameraCreate());
  const geometry = (grid.getObject().children[0] as THREE.LineSegments).geometry;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
  const segments: GridSegment[] = [];
  for (let vertex = 0; vertex + 1 < positions.count; vertex += 2) {
    segments.push({
      startY: positions.getY(vertex),
      endY: positions.getY(vertex + 1),
      startColor: new THREE.Color().fromBufferAttribute(colors, vertex),
      endColor: new THREE.Color().fromBufferAttribute(colors, vertex + 1),
    });
  }
  return segments;
}

describe('InfiniteGrid2D theme fade', () => {
  afterEach(() => document.documentElement.removeAttribute(UI_THEME_ATTRIBUTE));

  it('keeps flat single-color segments in the dark theme', () => {
    const segments = segmentsForTheme('dark');
    expect(segments.length).toBeGreaterThan(0);
    segments.forEach((segment) => expect(segment.startColor.equals(segment.endColor)).toBe(true));
  });

  it('fades dense light-theme lines into the top-to-bottom background gradient', () => {
    const vertical = segmentsForTheme('light').filter((segment) => segment.startY !== segment.endY);
    const shaded = vertical.filter((segment) => !segment.startColor.equals(segment.endColor));
    expect(shaded.length).toBeGreaterThan(0);
    for (const segment of shaded) {
      const lower = segment.startY < segment.endY ? segment.startColor : segment.endColor;
      const upper = segment.startY < segment.endY ? segment.endColor : segment.startColor;
      expect(upper.r + upper.g + upper.b).toBeGreaterThan(lower.r + lower.g + lower.b);
    }
  });
});
