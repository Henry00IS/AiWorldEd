import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ViewportBackgroundGradient } from '@/viewports/theme/viewport_background_gradient.js';

describe('ViewportBackgroundGradient', () => {
  it('renders a quad whose top and bottom vertices carry the requested colors', () => {
    const gradient = new ViewportBackgroundGradient();
    const render = vi.fn();
    gradient.render({ render } as unknown as THREE.WebGLRenderer, 0xffffff, 0x000000);
    expect(render).toHaveBeenCalledTimes(1);
    const scene = render.mock.calls[0]?.[0] as THREE.Scene;
    const mesh = scene.children[0] as THREE.Mesh;
    const colors = mesh.geometry.getAttribute('color');
    const positions = mesh.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      const expected = positions.getY(index) > 0 ? 1 : 0;
      expect(colors.getX(index)).toBeCloseTo(expected);
      expect(colors.getZ(index)).toBeCloseTo(expected);
    }
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    const camera = render.mock.calls[0]?.[1] as THREE.OrthographicCamera;
    expect(camera.near).toBeLessThan(0);
    expect(camera.far).toBeGreaterThan(0);
    expect(mesh.frustumCulled).toBe(false);
    gradient.dispose();
  });
});
