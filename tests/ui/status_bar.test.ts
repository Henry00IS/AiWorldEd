import { describe, it, expect, beforeEach } from 'vitest';
import { Theme } from '../../src/theme.js';
import { StatusBar } from '../../src/ui/status_bar.js';

describe('StatusBar', () => {
  let container: HTMLElement;
  let statusBar: StatusBar;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    statusBar = new StatusBar(container, Theme);
  });

  it('should create in the DOM', () => {
    const root = statusBar.getRootElement();
    expect(root).toBeDefined();
    expect(container.contains(root)).toBe(true);
  });

  it('should display initial undo/redo counts', () => {
    statusBar.setUndoRedoCounts(0, 0);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Undo: 0');
    expect(root.textContent).toContain('Redo: 0');
  });

  it('should update undo/redo text', () => {
    statusBar.setUndoRedoCounts(5, 3);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Undo: 5');
    expect(root.textContent).toContain('Redo: 3');
  });

  it('should update mode text', () => {
    statusBar.setTransformMode('Rotate');
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Mode: Rotate');
  });

  it('should update snap status to On with default interval', () => {
    statusBar.setSnapStatus(true);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Snap: On (0.25)');
  });

  it('should update snap status to Off without interval', () => {
    statusBar.setSnapStatus(false);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Snap: Off');
  });

  it('should update snap interval display', () => {
    statusBar.setSnapInterval(5.0);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Snap: On (5.0)');
  });

  it('should reflect new interval in subsequent snap status calls', () => {
    statusBar.setSnapInterval(10.0);
    statusBar.setSnapStatus(true);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Snap: On (10.0)');
  });

  it('should show correct interval after multiple updates', () => {
    statusBar.setSnapInterval(0.5);
    statusBar.setSnapInterval(2.0);
    statusBar.setSnapStatus(true);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Snap: On (2.0)');
  });

  it('should format non-integer interval without floating-point artifacts', () => {
    statusBar.setSnapInterval(7.5);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Snap: On (7.5)');
    expect(root.textContent).not.toContain('7.5000');
  });

  it('should format very small interval cleanly', () => {
    statusBar.setSnapInterval(0.07);
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Snap: On (0.07)');
    expect(root.textContent).not.toContain('0.0699');
  });

  it('should remove from DOM on dispose', () => {
    const root = statusBar.getRootElement();
    expect(container.contains(root)).toBe(true);
    statusBar.dispose();
    expect(container.contains(root)).toBe(false);
  });

  it('should use monospace font for text', () => {
    const root = statusBar.getRootElement();
    const spans = root.querySelectorAll('span');
    expect(spans.length).toBeGreaterThan(0);
    spans.forEach((span) => {
      expect(span.style.fontFamily).toBe('monospace');
    });
  });

  it('should display last action message', () => {
    statusBar.setLastAction('Duplicated 2 object(s)');
    const root = statusBar.getRootElement();
    expect(root.textContent).toContain('Duplicated 2 object(s)');
  });

  it('should clear last action with empty string', () => {
    statusBar.setLastAction('Some action');
    statusBar.setLastAction('');
    const lastActionSpan = statusBar.getRootElement().querySelectorAll('span')[1];
    expect(lastActionSpan.textContent).toBe('');
  });

  it('should have dark background from theme', () => {
    const root = statusBar.getRootElement();
    const bgValue = root.style.background;
    expect(bgValue).toMatch(/rgb\(26,\s*26,\s*26\)|#1a1a1a/);
  });
});
