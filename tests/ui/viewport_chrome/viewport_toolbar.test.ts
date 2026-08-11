import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ViewportToolbar } from '@/ui/viewport_chrome/viewport_toolbar.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { Theme } from '@/theme.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';

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

  it('should insert a control after the title wrapper', () => {
    const control = document.createElement('button');
    control.textContent = 'figurine';
    toolbar.insertControlAfterTitle(control);
    const children = Array.from(toolbar.getElement().children);
    expect(children.indexOf(control)).toBe(1);
  });

  it('should display the viewport title', () => {
    expect(toolbar.getElement().textContent).toContain('Top');
  });

  it('should use the compact 11px uppercase title label font', () => {
    const title = toolbar.getTitleElement();
    const label = title.querySelector('span');
    expect(label).not.toBeNull();
    expect(label!.style.fontSize).toBe('11px');
    expect(label!.style.fontWeight).toBe('600');
    expect(label!.style.textTransform).toBe('uppercase');
    expect(label!.style.fontFamily).toContain('Segoe UI');
    expect(label!.style.padding).toBe('0px 4px 0px 3px');
  });

  it('should expose a type menu caret control on the title button', () => {
    const title = toolbar.getTitleElement();
    expect(title.getAttribute('aria-haspopup')).toBe('menu');
    expect(title.textContent).toContain('▾');
  });

  it('should invoke kind change callback from the type menu', () => {
    const onKind = vi.fn();
    toolbar.setOnViewportKindChange(onKind);
    toolbar.setViewportKind(ViewportKind.TOP);
    toolbar.getTitleElement().click();
    const panel = toolbar.getTypeMenuPanel();
    expect(panel?.isOpen()).toBe(true);
    const perspectiveRow = Array.from(panel!.getElement().querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Perspective'),
    );
    expect(perspectiveRow).toBeDefined();
    perspectiveRow!.click();
    expect(onKind).toHaveBeenCalledWith(ViewportKind.PERSPECTIVE);
  });

  it('should close the type menu on outside pointerdown without needing mousedown', () => {
    // Perspective content preventDefault()s pointerdown (FlyingCamera), which
    // suppresses mousedown — outside close must use pointerdown capture.
    toolbar.setViewportKind(ViewportKind.PERSPECTIVE);
    toolbar.getTitleElement().click();
    const panel = toolbar.getTypeMenuPanel();
    expect(panel?.isOpen()).toBe(true);
    const content = document.createElement('div');
    document.body.appendChild(content);
    content.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(panel?.isOpen()).toBe(false);
    content.remove();
  });

  it('should close the type menu on outside right-button pointerdown', () => {
    toolbar.setViewportKind(ViewportKind.PERSPECTIVE);
    toolbar.getTitleElement().click();
    const panel = toolbar.getTypeMenuPanel();
    expect(panel?.isOpen()).toBe(true);
    const content = document.createElement('div');
    document.body.appendChild(content);
    content.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2 }));
    expect(panel?.isOpen()).toBe(false);
    content.remove();
  });

  it('should use the configured viewport toolbar height', () => {
    expect(toolbar.getElement().style.height).toBe(`${Theme.viewportToolbarHeightPx}px`);
  });

  it('should highlight the initial shading mode', () => {
    expect(toolbar.getActiveShadingMode()).toBe(ShadingMode.WIREFRAME);
    const wireButton = toolbar.getShadingButton(ShadingMode.WIREFRAME);
    expect(wireButton?.dataset['active']).toBe('true');
  });

  it('should expose solid, wireframe, and flat buttons', () => {
    expect(toolbar.getShadingButton(ShadingMode.SOLID)).toBeDefined();
    expect(toolbar.getShadingButton(ShadingMode.WIREFRAME)).toBeDefined();
    expect(toolbar.getShadingButton(ShadingMode.FLAT)).toBeDefined();
  });

  it('should place wireframe and projected-grid toggles left of shading with a separator', () => {
    const row = toolbar.getContentWireframesButton().parentElement;
    expect(row).not.toBeNull();
    const children = Array.from(row!.children);
    const wireIndex = children.indexOf(toolbar.getContentWireframesButton());
    const gridIndex = children.indexOf(toolbar.getProjectedGridButton());
    const solidIndex = children.indexOf(toolbar.getShadingButton(ShadingMode.SOLID)!);
    expect(wireIndex).toBeLessThan(gridIndex);
    expect(gridIndex).toBeLessThan(solidIndex);
    const separator = children[gridIndex + 1] as HTMLElement;
    expect(separator.style.width).toBe('1px');
    expect(toolbar.isContentWireframesActive()).toBe(true);
    expect(toolbar.isProjectedGridActive()).toBe(true);
  });

  it('should toggle content wireframes and notify the callback', () => {
    const onToggle = vi.fn();
    toolbar.setOnContentWireframesToggle(onToggle);
    toolbar.getContentWireframesButton().click();
    expect(toolbar.isContentWireframesActive()).toBe(false);
    expect(onToggle).toHaveBeenCalledWith(false);
    toolbar.getContentWireframesButton().click();
    expect(toolbar.isContentWireframesActive()).toBe(true);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('should toggle projected grid and notify the callback', () => {
    const onToggle = vi.fn();
    toolbar.setOnProjectedGridToggle(onToggle);
    toolbar.getProjectedGridButton().click();
    expect(toolbar.isProjectedGridActive()).toBe(false);
    expect(onToggle).toHaveBeenCalledWith(false);
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

  it('should invoke maximize callback and expose restore state', () => {
    const onToggleMaximize = vi.fn();
    toolbar.setOnToggleMaximize(onToggleMaximize);
    toolbar.getMaximizeButton().click();
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);

    toolbar.setMaximized(true);
    expect(toolbar.getMaximizeButton().dataset['active']).toBe('true');
    expect(toolbar.getMaximizeButton().title).toBe('Restore viewport layout');
  });

  it('should remove itself on dispose', () => {
    toolbar.dispose();
    expect(parent.children.length).toBe(0);
  });
});
