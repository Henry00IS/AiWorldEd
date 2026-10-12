import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OverlayLoopCutPreview } from '@/edit/overlay/overlay_loop_cut_preview.js';
import type { TopologyLoopCutCrossing } from '@/edit/topology/topology_loop_cut_plane.js';
import type { TopologyWorkingGeometry } from '@/edit/topology/topology_working_geometry.js';

describe('overlay_loop_cut_preview', () => {
  it('grows the line buffer when a later loop has more points', () => {
    const scene = new THREE.Scene();
    const preview = new OverlayLoopCutPreview(scene);
    const geometry = createChainGeometry(8);
    const warnings = captureConsoleWarnings(() => {
      preview.setLoop(geometry, createChainCrossings(3, 0.25), new THREE.Matrix4());
      preview.setLoop(geometry, createChainCrossings(6, 0.25), new THREE.Matrix4());
    });
    const position = readPreviewPosition(scene);
    expect(position.count).toBe(6);
    const last = expectedChainPoint(5, 0.25);
    expect(position.getX(5)).toBeCloseTo(last.x);
    expect(position.getY(5)).toBeCloseTo(last.y);
    expect(warnings.some((warning) => warning.includes('Buffer size too small'))).toBe(false);
    preview.dispose();
  });
});

/**
 * Builds a polyline of vertices along X and Y.
 *
 * @param vertexCount Vertex count.
 * @returns Working geometry.
 */
function createChainGeometry(vertexCount: number): TopologyWorkingGeometry {
  const positions: THREE.Vector3[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    positions.push(new THREE.Vector3(index, index * 0.5, 0));
  }
  return { positions, faces: [] };
}

/**
 * Builds crossings that each lerp one chain segment.
 *
 * @param count Crossing count.
 * @param parameter Segment parameter.
 * @returns Crossings.
 */
function createChainCrossings(count: number, parameter: number): TopologyLoopCutCrossing[] {
  const crossings: TopologyLoopCutCrossing[] = [];
  for (let index = 0; index < count; index += 1) {
    crossings.push({
      edgeKey: `${index}|${index + 1}`,
      vertexA: index,
      vertexB: index + 1,
      parameter,
    });
  }
  return crossings;
}

/**
 * Returns the world point a chain crossing should display.
 *
 * @param index Crossing index.
 * @param parameter Segment parameter.
 * @returns Expected point.
 */
function expectedChainPoint(index: number, parameter: number): THREE.Vector3 {
  const start = new THREE.Vector3(index, index * 0.5, 0);
  const end = new THREE.Vector3(index + 1, (index + 1) * 0.5, 0);
  return start.lerp(end, parameter);
}

/**
 * Reads the preview line position attribute.
 *
 * @param scene Scene that holds the preview.
 * @returns Position attribute.
 */
function readPreviewPosition(scene: THREE.Scene): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  const line = scene.getObjectByName('overlay_loop_cut_preview');
  if (!(line instanceof THREE.LineLoop)) {
    throw new Error('missing loop preview');
  }
  const position = line.geometry.getAttribute('position');
  if (!position) {
    throw new Error('missing loop positions');
  }
  return position;
}

/**
 * Runs a body while recording console warnings.
 *
 * @param run Body.
 * @returns Warning texts.
 */
function captureConsoleWarnings(run: () => void): string[] {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    run();
  } finally {
    console.warn = original;
  }
  return warnings;
}
