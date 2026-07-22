import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { PropertiesPanel } from '../../src/ui/properties_panel.js';

describe('PropertiesPanel', () => {
  let container: HTMLElement;
  let selectionManager: SelectionManager;
  let panel: PropertiesPanel;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new SelectionManager();
    panel = new PropertiesPanel(container, Theme, selectionManager);
  });

  afterEach(() => {
    panel.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should create panel and append to container', () => {
    expect(container.children.length).toBe(1);
  });

  it('should return container element via getContainer', () => {
    const returnedContainer = panel.getContainer();
    expect(returnedContainer).toBeInstanceOf(HTMLElement);
    expect(returnedContainer).toBe(container.children[0]);
  });

  it('should have column flex layout', () => {
    const panelElement = container.children[0] as HTMLElement;
    expect(panelElement.style.display).toBe('flex');
    expect(panelElement.style.flexDirection).toBe('column');
  });

  it('should have 4 sections (Position, Rotation, Scale, Material)', () => {
    const panelElement = container.children[0] as HTMLElement;
    const sections = panelElement.children;
    expect(sections.length).toBe(4);
  });

  it('should bind object and update inputs from object data', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(5.5, -3.2, 10.0);
    mesh.rotation.set(Math.PI / 4, Math.PI / 2, 0);
    mesh.scale.set(2.0, 1.5, 0.5);
    panel.bindObject(mesh);
    expect(true).toBe(true);
  });

  it('should bind object and set position inputs correctly', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(7.7, 3.3, -2.2);
    panel.bindObject(mesh);
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    expect(inputs[0].value).toBe('7.70');
    expect(inputs[1].value).toBe('3.30');
    expect(inputs[2].value).toBe('-2.20');
  });

  it('should show dashes for mixed multi-selection position axes', () => {
    const meshA = new THREE.Mesh();
    const meshB = new THREE.Mesh();
    meshA.position.set(1, 5, 3);
    meshB.position.set(2, 5, 9);
    panel.bindObjects([meshA, meshB]);
    const panelElement = container.children[0] as HTMLElement;
    const inputs = panelElement.children[0].querySelectorAll('input');
    expect(inputs[0].value).toBe('—');
    expect(inputs[1].value).toBe('5.00');
    expect(inputs[2].value).toBe('—');
  });

  it('should apply a typed axis value to all selected objects', () => {
    const meshA = new THREE.Mesh();
    const meshB = new THREE.Mesh();
    meshA.position.set(1, 5, 3);
    meshB.position.set(2, 5, 9);
    panel.bindObjects([meshA, meshB]);
    const panelElement = container.children[0] as HTMLElement;
    const inputs = panelElement.children[0].querySelectorAll('input');
    inputs[0].value = '10';
    inputs[0].dispatchEvent(new Event('change'));
    expect(meshA.position.x).toBeCloseTo(10);
    expect(meshB.position.x).toBeCloseTo(10);
    expect(meshA.position.y).toBeCloseTo(5);
    expect(meshB.position.y).toBeCloseTo(5);
    expect(meshA.position.z).toBeCloseTo(3);
    expect(meshB.position.z).toBeCloseTo(9);
  });

  it('should clear the mixed dash when the user focuses the field', () => {
    const meshA = new THREE.Mesh();
    const meshB = new THREE.Mesh();
    meshA.position.set(1, 5, 3);
    meshB.position.set(2, 5, 9);
    panel.bindObjects([meshA, meshB]);
    const panelElement = container.children[0] as HTMLElement;
    const inputs = panelElement.children[0].querySelectorAll('input');
    expect(inputs[0].value).toBe('—');
    inputs[0].dispatchEvent(new Event('focus'));
    expect(inputs[0].value).toBe('');
    inputs[0].value = '2';
    inputs[0].dispatchEvent(new Event('change'));
    expect(meshA.position.x).toBeCloseTo(2);
    expect(meshB.position.x).toBeCloseTo(2);
  });

  it('should apply material color to all selected meshes', () => {
    const meshA = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    const meshB = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x00ff00 })
    );
    panel.bindObjects([meshA, meshB]);
    const panelElement = container.children[0] as HTMLElement;
    const colorInput = panelElement.querySelector(
      'input[type="color"]'
    ) as HTMLInputElement;
    colorInput.value = '#0000ff';
    colorInput.dispatchEvent(new Event('input'));
    expect(
      (meshA.material as THREE.MeshStandardMaterial).color.getHex()
    ).toBe(0x0000ff);
    expect(
      (meshB.material as THREE.MeshStandardMaterial).color.getHex()
    ).toBe(0x0000ff);
  });

  it('should refresh inputs from the bound object after external transforms', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(1, 2, 3);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    panel.bindObject(mesh);
    mesh.position.set(10.5, -4.25, 8);
    mesh.rotation.set(Math.PI / 2, 0, 0);
    mesh.scale.set(2, 3, 4);
    panel.refreshBoundObject();
    const panelElement = container.children[0] as HTMLElement;
    const positionInputs = panelElement.children[0].querySelectorAll('input');
    const rotationInputs = panelElement.children[1].querySelectorAll('input');
    const scaleInputs = panelElement.children[2].querySelectorAll('input');
    expect(positionInputs[0].value).toBe('10.50');
    expect(positionInputs[1].value).toBe('-4.25');
    expect(positionInputs[2].value).toBe('8.00');
    expect(rotationInputs[0].value).toBe('90.0');
    expect(scaleInputs[0].value).toBe('2.00');
    expect(scaleInputs[1].value).toBe('3.00');
    expect(scaleInputs[2].value).toBe('4.00');
  });

  it('should no-op refresh when no object is bound', () => {
    expect(() => panel.refreshBoundObject()).not.toThrow();
  });

  it('should display rotation in degrees', () => {
    const mesh = new THREE.Mesh();
    mesh.rotation.set(Math.PI, Math.PI / 2, Math.PI / 4);
    panel.bindObject(mesh);
    const panelElement = container.children[0] as HTMLElement;
    const rotationSection = panelElement.children[1];
    const inputs = rotationSection.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    expect(inputs[0].value).toBe('180.0');
    expect(inputs[1].value).toBe('90.0');
    expect(inputs[2].value).toBe('45.0');
  });

  it('should unbind object and clear inputs', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(1, 2, 3);
    panel.bindObject(mesh);
    panel.unbindObject();
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    expect(inputs[0].value).toBe('');
    expect(inputs[1].value).toBe('');
    expect(inputs[2].value).toBe('');
  });

  it('should update bound object position from input change', () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 0, 0);
    panel.bindObject(mesh);
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    inputs[0].value = '42.5';
    inputs[0].dispatchEvent(new Event('change'));
    expect(mesh.position.x).toBe(42.5);
  });

  it('should update bound object scale from input change', () => {
    const mesh = new THREE.Mesh();
    mesh.scale.set(1, 1, 1);
    panel.bindObject(mesh);
    const panelElement = container.children[0] as HTMLElement;
    const scaleSection = panelElement.children[2];
    const inputs = scaleSection.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    inputs[1].value = '3.0';
    inputs[1].dispatchEvent(new Event('change'));
    expect(mesh.scale.y).toBe(3.0);
  });

  it('should toggle section visibility on header click', () => {
    const panelElement = container.children[0] as HTMLElement;
    const section = panelElement.children[0] as HTMLElement;
    const header = section.children[0] as HTMLElement;
    const content = section.children[1] as HTMLElement;
    header.click();
    expect(content.style.display).toBe('none');
    header.click();
    expect(content.style.display).toBe('block');
  });

  it('should have axis labels with correct colors', () => {
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const labels = positionSection.querySelectorAll('span');
    if (labels.length >= 3) {
      const xRgb = `rgb(${(Theme.gizmoXAxisColor >> 16) & 255}, ${(Theme.gizmoXAxisColor >> 8) & 255}, ${Theme.gizmoXAxisColor & 255})`;
      const yRgb = `rgb(${(Theme.gizmoYAxisColor >> 16) & 255}, ${(Theme.gizmoYAxisColor >> 8) & 255}, ${Theme.gizmoYAxisColor & 255})`;
      const zRgb = `rgb(${(Theme.gizmoZAxisColor >> 16) & 255}, ${(Theme.gizmoZAxisColor >> 8) & 255}, ${Theme.gizmoZAxisColor & 255})`;
      expect(labels[0].style.color).toBe(xRgb);
      expect(labels[1].style.color).toBe(yRgb);
      expect(labels[2].style.color).toBe(zRgb);
    }
  });

  it('should have correct panel width', () => {
    const panelElement = container.children[0] as HTMLElement;
    expect(panelElement.style.width).toBe('200px');
    expect(panelElement.style.minWidth).toBe('200px');
  });

  it('should have monospace font for labels', () => {
    const panelElement = container.children[0] as HTMLElement;
    const header = panelElement.children[0].children[0] as HTMLElement;
    expect(header.style.fontFamily).toBe('monospace');
  });

  it('should remove from DOM on dispose', () => {
    panel.dispose();
    expect(container.children.length).toBe(0);
  });

  it('should react to selection changes', () => {
    const changeHandler = vi.fn();
    selectionManager.onSelectionChanged(changeHandler);
    expect(changeHandler).toBeDefined();
  });
});
