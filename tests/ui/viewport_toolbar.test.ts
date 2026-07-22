import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewportToolbar } from '../../src/ui/viewport_toolbar.js';
import { ShadingMode } from '../../src/types/shading_mode.js';
import { Theme } from '../../src/theme.js';

describe('ViewportToolbar', () => {
  let parent: HTMLElement;
  let toolbar: ViewportToolbar;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    toolbar = new ViewportToolbar(parent, 'Top', ShadingMode.WIREFRAME);
  });

  afterEach(() => {
    toolbar.dispose();
    if (parent.parentNode) {
      parent.parentNode.removeChild(parent);
    }
  });

  it('should append a toolbar strip to the parent', () => {
    expect(parent.children.length).toBe(1);
    expect(toolbar.getElement().parentNode).toBe(parent);
  });

  it('should display the viewport title', () => {
    expect(toolbar.getElement().textContent).toContain('Top');
  });

  it('should use the configured viewport toolbar height', () => {
    expect(toolbar.getElement().style.height).toBe(
      `${Theme.viewportToolbarHeightPx}px`
    );
  });

  it('should highlight the initial shading mode', () => {
    expect(toolbar.getActiveShadingMode()).toBe(ShadingMode.WIREFRAME);
    const wireButton = toolbar.getShadingButton(ShadingMode.WIREFRAME);
    expect(wireButton?.dataset.active).toBe('true');
  });

  it('should expose solid, wireframe, and flat buttons', () => {
    expect(toolbar.getShadingButton(ShadingMode.SOLID)).toBeDefined();
    expect(toolbar.getShadingButton(ShadingMode.WIREFRAME)).toBeDefined();
    expect(toolbar.getShadingButton(ShadingMode.FLAT)).toBeDefined();
  });

  it('should invoke shading callback and update active mode', () => {
    const onMode = vi.fn();
    toolbar.setOnShadingMode(onMode);
    toolbar.getShadingButton(ShadingMode.SOLID)?.click();
    expect(onMode).toHaveBeenCalledWith(ShadingMode.SOLID);
    expect(toolbar.getActiveShadingMode()).toBe(ShadingMode.SOLID);
  });

  it('should invoke fit callback when Fit is clicked', () => {
    const onFit = vi.fn();
    toolbar.setOnFit(onFit);
    toolbar.getFitButton().click();
    expect(onFit).toHaveBeenCalledTimes(1);
  });

  it('should remove itself on dispose', () => {
    toolbar.dispose();
    expect(parent.children.length).toBe(0);
  });
});
