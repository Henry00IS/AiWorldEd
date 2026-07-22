import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ShadingModeHandler } from '../../src/managers/shading_mode_handler.js';
import { ViewportShadingController } from '../../src/viewports/viewport_shading_controller.js';
import { ShadingMode } from '../../src/types/shading_mode.js';
import { ShadableViewport } from '../../src/viewports/viewport_shading_controller.js';

class MockViewport implements ShadableViewport {
  private scene: THREE.Scene;

  constructor() {
    this.scene = new THREE.Scene();
  }

  getScene(): THREE.Scene {
    return this.scene;
  }
}

class MockStatusBar {
  shadingMode: string | null;

  setShadingMode(mode: string): void {
    this.shadingMode = mode;
  }
}

describe('ShadingModeHandler', () => {
  let controllers: ViewportShadingController[];
  let mockStatusBar: MockStatusBar & StatusBar;
  let handler: ShadingModeHandler;

  beforeEach(() => {
    const vp1 = new MockViewport();
    const vp2 = new MockViewport();
    const vp3 = new MockViewport();
    controllers = [
      new ViewportShadingController(vp1),
      new ViewportShadingController(vp2),
      new ViewportShadingController(vp3)
    ];
    mockStatusBar = new MockStatusBar() as MockStatusBar & StatusBar;
    handler = new ShadingModeHandler(controllers, 0, mockStatusBar);
  });

  describe('default state', () => {
    it('should default active mode to SOLID', () => {
      expect(handler.getActiveMode()).toBe(ShadingMode.SOLID);
    });
  });

  describe('applyShadingMode', () => {
    it('should apply mode only to active viewport', () => {
      handler.applyShadingMode(ShadingMode.WIREFRAME);
      expect(controllers[0].getShadingMode()).toBe(ShadingMode.WIREFRAME);
      expect(controllers[1].getShadingMode()).toBe(ShadingMode.SOLID);
      expect(controllers[2].getShadingMode()).toBe(ShadingMode.SOLID);
    });

    it('should update status bar with mode name', () => {
      handler.applyShadingMode(ShadingMode.FLAT);
      expect(mockStatusBar.shadingMode).toBe('FLAT');
    });

    it('should apply WIREFRAME_OVERLAY to active viewport', () => {
      handler.applyShadingMode(ShadingMode.WIREFRAME_OVERLAY);
      expect(controllers[0].getShadingMode()).toBe(ShadingMode.WIREFRAME_OVERLAY);
    });

    it('should get active mode after applying', () => {
      handler.applyShadingMode(ShadingMode.WIREFRAME);
      expect(handler.getActiveMode()).toBe(ShadingMode.WIREFRAME);
    });

    it('should be a no-op for invalid viewport index', () => {
      const handlerWithBadIndex = new ShadingModeHandler(controllers, -1, mockStatusBar);
      expect(() => handlerWithBadIndex.applyShadingMode(ShadingMode.FLAT)).not.toThrow();
    });
  });

  describe('applyShadingModeToAll', () => {
    it('should apply mode to all viewports', () => {
      handler.applyShadingModeToAll(ShadingMode.FLAT);
      expect(controllers[0].getShadingMode()).toBe(ShadingMode.FLAT);
      expect(controllers[1].getShadingMode()).toBe(ShadingMode.FLAT);
      expect(controllers[2].getShadingMode()).toBe(ShadingMode.FLAT);
    });

    it('should update status bar after applying to all', () => {
      handler.applyShadingModeToAll(ShadingMode.WIREFRAME);
      expect(mockStatusBar.shadingMode).toBe('WIREFRAME');
    });

    it('should handle WIREFRAME_OVERLAY for all viewports', () => {
      handler.applyShadingModeToAll(ShadingMode.WIREFRAME_OVERLAY);
      expect(controllers[0].getShadingMode()).toBe(ShadingMode.WIREFRAME_OVERLAY);
      expect(controllers[1].getShadingMode()).toBe(ShadingMode.WIREFRAME_OVERLAY);
    });
  });

  describe('setActiveViewportIndex', () => {
    it('should change which viewport receives shading changes', () => {
      handler.setActiveViewportIndex(1);
      handler.applyShadingMode(ShadingMode.WIREFRAME);
      expect(controllers[0].getShadingMode()).toBe(ShadingMode.SOLID);
      expect(controllers[1].getShadingMode()).toBe(ShadingMode.WIREFRAME);
      expect(controllers[2].getShadingMode()).toBe(ShadingMode.SOLID);
    });

    it('should update active mode after changing index', () => {
      handler.setActiveViewportIndex(2);
      expect(handler.getActiveMode()).toBe(ShadingMode.SOLID);
      handler.applyShadingMode(ShadingMode.FLAT);
      expect(handler.getActiveMode()).toBe(ShadingMode.FLAT);
    });

    it('should return SOLID for invalid viewport index', () => {
      handler.setActiveViewportIndex(-1);
      expect(handler.getActiveMode()).toBe(ShadingMode.SOLID);
    });
  });

  describe('null status bar', () => {
    it('should not crash with null status bar', () => {
      const handlerNoBar = new ShadingModeHandler(controllers, 0, null);
      expect(() => handlerNoBar.applyShadingMode(ShadingMode.WIREFRAME)).not.toThrow();
      expect(() => handlerNoBar.applyShadingModeToAll(ShadingMode.FLAT)).not.toThrow();
    });
  });

  describe('independent viewport modes', () => {
    it('should allow different modes per viewport', () => {
      handler.setActiveViewportIndex(0);
      handler.applyShadingMode(ShadingMode.SOLID);
      handler.setActiveViewportIndex(1);
      handler.applyShadingMode(ShadingMode.WIREFRAME);
      handler.setActiveViewportIndex(2);
      handler.applyShadingMode(ShadingMode.FLAT);
      expect(controllers[0].getShadingMode()).toBe(ShadingMode.SOLID);
      expect(controllers[1].getShadingMode()).toBe(ShadingMode.WIREFRAME);
      expect(controllers[2].getShadingMode()).toBe(ShadingMode.FLAT);
    });
  });
});
