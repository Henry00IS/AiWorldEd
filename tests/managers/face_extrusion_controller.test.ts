import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FaceExtrusionController } from '../../src/managers/face_extrusion_controller.js';
import { SelectionMode } from '../../src/types/selection_mode.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { GridSnap } from '../../src/transform/grid_snap.js';

describe('FaceExtrusionController', () => {
  let scene: THREE.Scene;
  let world: THREE.Group;
  let commandStack: CommandStack;
  let gridSnap: GridSnap;
  let controller: FaceExtrusionController;

  beforeEach(() => {
    scene = new THREE.Scene();
    world = new THREE.Group();
    commandStack = new CommandStack(64);
    gridSnap = new GridSnap(false, 1.0);
    controller = new FaceExtrusionController(scene, commandStack, gridSnap, world);
  });

  describe('initial state', () => {
    it('should start in object selection mode', () => {
      expect(controller.getSelectionMode()).toBe(SelectionMode.OBJECT);
    });

    it('should have zero selected faces initially', () => {
      expect(controller.getSelectedFaceCount()).toBe(0);
    });
  });

  describe('selection mode switching', () => {
    it('should switch from object to face mode', () => {
      controller.setSelectionMode(SelectionMode.FACE);
      expect(controller.getSelectionMode()).toBe(SelectionMode.FACE);
    });

    it('should clear face selection when switching to object mode', () => {
      const mesh = createTestMesh();
      controller.setAvailableMeshes([mesh]);
      controller.setSelectionMode(SelectionMode.FACE);
      controller.selectFace(mesh, 0, false);
      expect(controller.getSelectedFaceCount()).toBeGreaterThan(0);
      controller.setSelectionMode(SelectionMode.OBJECT);
      expect(controller.getSelectedFaceCount()).toBe(0);
    });
  });

  describe('extrusion creates new objects', () => {
    it('should add a new convex prism to the world root', () => {
      const mesh = createTestMesh();
      world.add(mesh);
      controller.setAvailableMeshes([mesh]);
      controller.setSelectionMode(SelectionMode.FACE);
      controller.selectFace(mesh, 0, false);
      const created = controller.extrudeSelectedFaces(1.0);
      expect(created.length).toBe(1);
      expect(world.children.includes(created[0])).toBe(true);
      expect(created[0]).not.toBe(mesh);
    });

    it('should leave the source mesh geometry triangle count unchanged', () => {
      const mesh = createTestMesh();
      const before = mesh.geometry.index
        ? mesh.geometry.index.count / 3
        : mesh.geometry.getAttribute('position').count / 3;
      world.add(mesh);
      controller.setAvailableMeshes([mesh]);
      controller.setSelectionMode(SelectionMode.FACE);
      controller.selectFace(mesh, 0, false);
      controller.extrudeSelectedFaces(1.0);
      const after = mesh.geometry.index
        ? mesh.geometry.index.count / 3
        : mesh.geometry.getAttribute('position').count / 3;
      expect(after).toBe(before);
    });

    it('should return empty when no faces are selected', () => {
      expect(controller.extrudeSelectedFaces(1.0)).toEqual([]);
    });

    it('should support undo by removing the created prism', () => {
      const mesh = createTestMesh();
      world.add(mesh);
      controller.setAvailableMeshes([mesh]);
      controller.setSelectionMode(SelectionMode.FACE);
      controller.selectFace(mesh, 0, false);
      const created = controller.extrudeSelectedFaces(1.0);
      expect(world.children.includes(created[0])).toBe(true);
      commandStack.undo();
      expect(world.children.includes(created[0])).toBe(false);
    });

    it('should create one solid per distinct selected face', () => {
      const mesh = createTestMesh();
      world.add(mesh);
      controller.setAvailableMeshes([mesh]);
      controller.setSelectionMode(SelectionMode.FACE);
      controller.selectFace(mesh, 0, false);
      controller.selectFace(mesh, 4, true);
      const created = controller.extrudeSelectedFaces(1.0);
      expect(created.length).toBe(2);
      expect(world.children.includes(created[0])).toBe(true);
      expect(world.children.includes(created[1])).toBe(true);
      expect(created[0]).not.toBe(created[1]);
    });
  });

  describe('pointer down in object mode', () => {
    it('should not consume pointer events in object mode', () => {
      controller.setSelectionMode(SelectionMode.OBJECT);
      const mockEvent = createMockPointerEvent(100, 100);
      const camera = new THREE.PerspectiveCamera();
      const result = controller.onPointerDown(mockEvent, camera, createMockRenderer());
      expect(result).toBe(false);
    });
  });

  describe('face selection listeners', () => {
    it('should notify face selection changed callback when faces are selected', () => {
      const mesh = createTestMesh();
      controller.setAvailableMeshes([mesh]);
      controller.setSelectionMode(SelectionMode.FACE);
      let notifiedCount = -1;
      controller.setFaceSelectionChangedCallback((faces) => {
        notifiedCount = faces.length;
      });
      controller.selectFace(mesh, 0, false);
      expect(notifiedCount).toBeGreaterThan(0);
    });

    it('should notify when face selection is cleared', () => {
      const mesh = createTestMesh();
      controller.setAvailableMeshes([mesh]);
      controller.setSelectionMode(SelectionMode.FACE);
      controller.selectFace(mesh, 0, false);
      let notifiedCount = -1;
      controller.setFaceSelectionChangedCallback((faces) => {
        notifiedCount = faces.length;
      });
      controller.setSelectionMode(SelectionMode.OBJECT);
      expect(notifiedCount).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should clear internal state on dispose', () => {
      controller.dispose();
      expect(controller.getSelectedFaceCount()).toBe(0);
    });
  });
});

/**
 * Creates a simple box mesh for testing.
 * @returns A mesh with a box geometry.
 */
function createTestMesh(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
}

/**
 * Creates a minimal mock pointer event.
 * @param x The x coordinate.
 * @param y The y coordinate.
 * @returns A mock MouseEvent object.
 */
function createMockPointerEvent(x: number, y: number): MouseEvent {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    shiftKey: false,
    preventDefault: () => {}
  } as MouseEvent;
}

/**
 * Creates a minimal mock WebGL renderer for testing.
 * @returns A mock renderer with required methods.
 */
function createMockRenderer(): THREE.WebGLRenderer {
  const domElement = document.createElement('canvas');
  domElement.width = 800;
  domElement.height = 600;
  return {
    domElement,
    getSize: () => new THREE.Vector2(800, 600),
    render: () => {},
    setPixelRatio: () => {},
    setSize: () => {},
    dispose: () => {},
    getContext: () => null
  } as unknown as THREE.WebGLRenderer;
}
