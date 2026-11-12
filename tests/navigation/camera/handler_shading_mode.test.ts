import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HandlerShadingMode } from '@/navigation/camera/handler_shading_mode.js';
import { ControllerViewportShading } from '@/viewports/shading/controller_viewport_shading.js';
import { ShadingMode } from '@/types/shading_mode.js';
import { ShadableViewport } from '@/viewports/shading/controller_viewport_shading.js';
import { StatusBar } from '@/ui/status/status_bar.js';

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
  shadingMode: string | null = null;

  setShadingMode(mode: string): void {
    this.shadingMode = mode;
  }
}

describe('ShadingModeHandler', () => {
  let controllers: ControllerViewportShading[];
  let mockStatusBar: MockStatusBar & StatusBar;
  let handler: HandlerShadingMode;

  beforeEach(() => {
    const vp1 = new MockViewport();
    const vp2 = new MockViewport();
    const vp3 = new MockViewport();
    controllers = [
      new ControllerViewportShading(vp1),
      new ControllerViewportShading(vp2),
      new ControllerViewportShading(vp3),
    ];
    mockStatusBar = new MockStatusBar() as MockStatusBar & StatusBar;
    handler = new HandlerShadingMode(controllers, 0, mockStatusBar);
  });

  describe('default state', () => {
    it('should default active mode to SOLID', () => {
      expect(handler.getActiveMode()).toBe(ShadingMode.SOLID);
    });
  });

  describe('applyShadingMode', () => {
    it('should apply mode only to active viewport', () => {
      handler.applyShadingMode(ShadingMode.WIREFRAME);
      expect(controllers[0]!.getShadingMode()).toBe(ShadingMode.WIREFRAME);
      expect(controllers[1]!.getShadingMode()).toBe(ShadingMode.SOLID);
      expect(controllers[2]!.getShadingMode()).toBe(ShadingMode.SOLID);
    });

    it('should update status bar with mode name', () => {
      handler.applyShadingMode(ShadingMode.FLAT);
      expect(mockStatusBar.shadingMode).toBe('FLAT');
    });

    it('should apply WIREFRAME_OVERLAY to active viewport', () => {
      handler.applyShadingMode(ShadingMode.WIREFRAME_OVERLAY);
      expect(controllers[0]!.getShadingMode()).toBe(ShadingMode.WIREFRAME_OVERLAY);
    });

    it('should get active mode after applying', () => {
      handler.applyShadingMode(ShadingMode.WIREFRAME);
      expect(handler.getActiveMode()).toBe(ShadingMode.WIREFRAME);
    });

    it('should be a no-op for invalid viewport index', () => {
      const handlerWithBadIndex = new HandlerShadingMode(controllers, -1, mockStatusBar);
      expect(() => handlerWithBadIndex.applyShadingMode(ShadingMode.FLAT)).not.toThrow();
    });
  });

  describe('applyShadingModeToAll', () => {
    it('should apply mode to all viewports', () => {
      handler.applyShadingModeToAll(ShadingMode.FLAT);
      expect(controllers[0]!.getShadingMode()).toBe(ShadingMode.FLAT);
      expect(controllers[1]!.getShadingMode()).toBe(ShadingMode.FLAT);
      expect(controllers[2]!.getShadingMode()).toBe(ShadingMode.FLAT);
    });

    it('should update status bar after applying to all', () => {
      handler.applyShadingModeToAll(ShadingMode.WIREFRAME);
      expect(mockStatusBar.shadingMode).toBe('WIREFRAME');
    });

    it('should show CLAY and OVERLAP in the status bar', () => {
      handler.applyShadingMode(ShadingMode.CLAY);
      expect(mockStatusBar.shadingMode).toBe('CLAY');
      handler.applyShadingMode(ShadingMode.OVERLAP);
      expect(mockStatusBar.shadingMode).toBe('OVERLAP');
    });

    it('should handle WIREFRAME_OVERLAY for all viewports', () => {
      handler.applyShadingModeToAll(ShadingMode.WIREFRAME_OVERLAY);
      expect(controllers[0]!.getShadingMode()).toBe(ShadingMode.WIREFRAME_OVERLAY);
      expect(controllers[1]!.getShadingMode()).toBe(ShadingMode.WIREFRAME_OVERLAY);
    });
  });

  describe('setActiveViewportIndex', () => {
    it('should change which viewport receives shading changes', () => {
      handler.setActiveViewportIndex(1);
      handler.applyShadingMode(ShadingMode.WIREFRAME);
      expect(controllers[0]!.getShadingMode()).toBe(ShadingMode.SOLID);
      expect(controllers[1]!.getShadingMode()).toBe(ShadingMode.WIREFRAME);
      expect(controllers[2]!.getShadingMode()).toBe(ShadingMode.SOLID);
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
      const handlerNoBar = new HandlerShadingMode(controllers, 0, null);
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
      expect(controllers[0]!.getShadingMode()).toBe(ShadingMode.SOLID);
      expect(controllers[1]!.getShadingMode()).toBe(ShadingMode.WIREFRAME);
      expect(controllers[2]!.getShadingMode()).toBe(ShadingMode.FLAT);
    });
  });
});
