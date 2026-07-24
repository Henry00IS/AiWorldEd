import { describe, expect, it } from 'vitest';
import { ViewportPaneLayout } from '../../src/managers/viewport_pane_layout.js';

/**
 * Creates independently named viewport containers in the production ordering.
 * @returns Viewport area and its top, front, side, and perspective containers.
 */
function createViewportLayoutFixture(): { area: HTMLElement; viewports: HTMLElement[] } {
  const area = document.createElement('div');
  const viewports = ['top', 'front', 'side', 'perspective'].map((slot) => {
    const viewport = document.createElement('div');
    viewport.style.gridArea = slot;
    area.appendChild(viewport);
    return viewport;
  });
  return { area, viewports };
}

describe('ViewportPaneLayout', () => {
  it('should show the expected camera and plane combinations for every pane count', () => {
    const fixture = createViewportLayoutFixture();
    const layout = new ViewportPaneLayout(fixture.area, fixture.viewports);
    const expectedVisibleSlots = [
      ['perspective'],
      ['top', 'perspective'],
      ['top', 'front', 'perspective'],
      ['top', 'front', 'side', 'perspective']
    ];

    expectedVisibleSlots.forEach((expectedSlots, index) => {
      layout.apply((index + 1) as 1 | 2 | 3 | 4);
      const actualSlots = fixture.viewports
        .filter((viewport) => viewport.style.display !== 'none')
        .map((viewport) => viewport.style.gridArea);
      expect(actualSlots).toEqual(expectedSlots);
    });
  });

  it('should resize the grid template to match the selected pane arrangement', () => {
    const fixture = createViewportLayoutFixture();
    const layout = new ViewportPaneLayout(fixture.area, fixture.viewports);

    layout.apply(1);
    expect(fixture.area.style.gridTemplateAreas).toContain('perspective');
    expect(fixture.area.style.gridTemplateColumns).toBe('1fr');

    layout.apply(3);
    expect(fixture.area.style.gridTemplateAreas).toContain('top front');
    expect(fixture.area.style.gridTemplateAreas).toContain('perspective perspective');

    layout.apply(4);
    expect(fixture.area.style.gridTemplateAreas).toContain('side perspective');
  });
});
