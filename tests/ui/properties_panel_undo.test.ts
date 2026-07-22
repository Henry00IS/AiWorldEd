import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Theme } from '../../src/theme.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { PropertiesPanel } from '../../src/ui/properties_panel.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { SetPositionCommand } from '../../src/commands/set_position_command.js';
import { SetRotationCommand } from '../../src/commands/set_rotation_command.js';
import { SetScaleCommand } from '../../src/commands/set_scale_command.js';

describe('PropertiesPanel Undo Integration', () => {
  let container: HTMLElement;
  let selectionManager: SelectionManager;
  let panel: PropertiesPanel;
  let commandStack: CommandStack;
  let mesh: THREE.Mesh;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new SelectionManager();
    commandStack = new CommandStack(64);
    panel = new PropertiesPanel(container, Theme, selectionManager);
    panel.setCommandStack(commandStack);
    mesh = new THREE.Mesh();
    mesh.position.set(1, 2, 3);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    panel.bindObject(mesh);
  });

  afterEach(() => {
    panel.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('should push command on position input change', () => {
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    expect(commandStack.getUndoCount()).toBe(0);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    inputs[0].value = '42.5';
    inputs[0].dispatchEvent(new Event('change'));
    expect(commandStack.getUndoCount()).toBe(1);
  });

  it('should push command on rotation input change', () => {
    const panelElement = container.children[0] as HTMLElement;
    const rotationSection = panelElement.children[1];
    const inputs = rotationSection.querySelectorAll('input');
    expect(commandStack.getUndoCount()).toBe(0);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    inputs[0].value = '45';
    inputs[0].dispatchEvent(new Event('change'));
    expect(commandStack.getUndoCount()).toBe(1);
  });

  it('should push command on scale input change', () => {
    const panelElement = container.children[0] as HTMLElement;
    const scaleSection = panelElement.children[2];
    const inputs = scaleSection.querySelectorAll('input');
    expect(commandStack.getUndoCount()).toBe(0);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    inputs[0].value = '3.5';
    inputs[0].dispatchEvent(new Event('change'));
    expect(commandStack.getUndoCount()).toBe(1);
  });

  it('should undo restore original position value', () => {
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    inputs[0].value = '99.9';
    inputs[0].dispatchEvent(new Event('change'));
    expect(mesh.position.x).toBeCloseTo(99.9);
    commandStack.undo();
    expect(mesh.position.x).toBeCloseTo(1);
  });

  it('should redo re-apply position value after undo', () => {
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    inputs[0].value = '99.9';
    inputs[0].dispatchEvent(new Event('change'));
    expect(mesh.position.x).toBeCloseTo(99.9);
    commandStack.undo();
    expect(mesh.position.x).toBeCloseTo(1);
    commandStack.redo();
    expect(mesh.position.x).toBeCloseTo(99.9);
  });

  it('should NOT push command when input is NaN', () => {
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    if (inputs.length >= 1) {
      inputs[0].value = '';
      inputs[0].dispatchEvent(new Event('change'));
    }
    expect(commandStack.getUndoCount()).toBe(0);
  });

  it('should NOT push command when no command stack is set', () => {
    const unboundPanel = createUnboundPanel();
    const unboundMesh = new THREE.Mesh();
    unboundMesh.position.set(0, 0, 0);
    unboundPanel.bindObject(unboundMesh);
    const panelElement = unboundPanel.getContainer();
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    if (inputs.length >= 1) {
      inputs[0].value = '50';
      inputs[0].dispatchEvent(new Event('change'));
    }
    expect(unboundMesh.position.x).toBe(50);
    unboundPanel.dispose();
  });

  it('should undo rotation changes', () => {
    const panelElement = container.children[0] as HTMLElement;
    const rotationSection = panelElement.children[1];
    const inputs = rotationSection.querySelectorAll('input');
    if (inputs.length >= 1) {
      inputs[1].value = '90';
      inputs[1].dispatchEvent(new Event('change'));
    }
    expect(mesh.rotation.y).toBeCloseTo(THREE.MathUtils.degToRad(90));
    commandStack.undo();
    expect(mesh.rotation.y).toBeCloseTo(0);
  });

  it('should undo scale changes', () => {
    const panelElement = container.children[0] as HTMLElement;
    const scaleSection = panelElement.children[2];
    const inputs = scaleSection.querySelectorAll('input');
    if (inputs.length >= 1) {
      inputs[2].value = '10.0';
      inputs[2].dispatchEvent(new Event('change'));
    }
    expect(mesh.scale.z).toBeCloseTo(10);
    commandStack.undo();
    expect(mesh.scale.z).toBeCloseTo(1);
  });

  it('should update inputs to normalized precision after command', () => {
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    if (inputs.length >= 1) {
      inputs[0].value = '12.345678';
      inputs[0].dispatchEvent(new Event('change'));
    }
    expect(inputs[0].value).toBe('12.35');
  });

  it('should handle multiple sequential edits as separate commands', () => {
    const panelElement = container.children[0] as HTMLElement;
    const positionSection = panelElement.children[0];
    const inputs = positionSection.querySelectorAll('input');
    if (inputs.length >= 1) {
      inputs[0].value = '10';
      inputs[0].dispatchEvent(new Event('change'));
      inputs[0].value = '20';
      inputs[0].dispatchEvent(new Event('change'));
    }
    expect(commandStack.getUndoCount()).toBe(2);
    expect(mesh.position.x).toBeCloseTo(20);
    commandStack.undo();
    expect(mesh.position.x).toBeCloseTo(10);
    commandStack.undo();
    expect(mesh.position.x).toBeCloseTo(1);
  });

  it('should coalesce many color picker inputs into one undo entry', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    mesh.material = material;
    panel.bindObject(mesh);
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colorInput).toBeTruthy();
    colorInput.value = '#112233';
    colorInput.dispatchEvent(new Event('input'));
    colorInput.value = '#445566';
    colorInput.dispatchEvent(new Event('input'));
    colorInput.value = '#00ff00';
    colorInput.dispatchEvent(new Event('input'));
    expect(commandStack.getUndoCount()).toBe(1);
    expect(material.color.getHex()).toBe(0x00ff00);
    commandStack.undo();
    expect(material.color.getHex()).toBe(0xff0000);
    commandStack.redo();
    expect(material.color.getHex()).toBe(0x00ff00);
  });

  it('should register one undo entry when only change fires', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    mesh.material = material;
    panel.bindObject(mesh);
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    colorInput.value = '#00ff00';
    colorInput.dispatchEvent(new Event('change'));
    expect(commandStack.getUndoCount()).toBe(1);
    expect(material.color.getHex()).toBe(0x00ff00);
    commandStack.undo();
    expect(material.color.getHex()).toBe(0xff0000);
  });

  it('should discard the color command when the gesture ends on the original color', () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xaabbcc });
    mesh.material = material;
    panel.bindObject(mesh);
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    colorInput.value = '#123456';
    colorInput.dispatchEvent(new Event('input'));
    expect(commandStack.getUndoCount()).toBe(1);
    colorInput.value = '#aabbcc';
    colorInput.dispatchEvent(new Event('input'));
    colorInput.dispatchEvent(new Event('blur'));
    expect(commandStack.getUndoCount()).toBe(0);
    expect(material.color.getHex()).toBe(0xaabbcc);
  });

  it('should start a new undo entry after the previous color gesture finalizes', () => {
    vi.useFakeTimers();
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    mesh.material = material;
    panel.bindObject(mesh);
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    colorInput.value = '#00ff00';
    colorInput.dispatchEvent(new Event('input'));
    expect(commandStack.getUndoCount()).toBe(1);
    vi.advanceTimersByTime(300);
    colorInput.value = '#0000ff';
    colorInput.dispatchEvent(new Event('input'));
    expect(commandStack.getUndoCount()).toBe(2);
    expect(material.color.getHex()).toBe(0x0000ff);
    commandStack.undo();
    expect(material.color.getHex()).toBe(0x00ff00);
    commandStack.undo();
    expect(material.color.getHex()).toBe(0xff0000);
    vi.useRealTimers();
  });
});

/**
 * Creates a PropertiesPanel without a command stack attached.
 * @returns A fresh panel instance with no command stack.
 */
function createUnboundPanel(): PropertiesPanel {
  const tempContainer = document.createElement('div');
  document.body.appendChild(tempContainer);
  const tempSelectionManager = new SelectionManager();
  const tempPanel = new PropertiesPanel(
    tempContainer,
    Theme,
    tempSelectionManager
  );
  return tempPanel;
}
