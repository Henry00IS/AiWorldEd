import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorApi } from '@/ai/client/editor_api.js';
import type { EditorApiHost } from '@/ai/client/editor_api_host.js';
import {
  buildSizeCandidates,
  clampCaptureResolution,
  isValidJpegBase64,
  MCP_CAPTURE_DEFAULT_SIZE,
  MCP_CAPTURE_MAX_BASE64_CHARS,
  stripDataUrlBase64Prefix,
} from '@/ai/client/editor_api_capture_pixels.js';
import { flipRgbaPixelsVertically } from '@/viewports/capture/offscreen_capture.js';
import { resolveCaptureCameraPose } from '@/ai/client/editor_api_capture_camera.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidModelCreate } from '@/solid/commands/model/command_solid_model_create.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerSnap } from '@/transform/snap/manager_snap.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { SolidModelPanel } from '@/solid/ui/panel/solid_model_panel.js';

/**
 * Builds a minimal EditorApiHost without scene/renderer.
 *
 * @param worldObject World group.
 * @returns Host bag.
 */
function createTestHost(worldObject: THREE.Group): EditorApiHost {
  const stack = new CommandStack(64);
  const selection = new ManagerSelection();
  const panelHost = document.createElement('div');
  const panel = new SolidModelPanel(panelHost, { onAddBoxBrush: () => undefined });
  const solidModelController = new SolidModelController(worldObject, stack, selection, panel);
  return {
    worldObject,
    commandStack: stack,
    selectionManager: selection,
    solidModelController,
    gridSnap: new GridSnap(true, 0.25),
    snapManager: new ManagerSnap(0.25),
    getUserSnapEnabled: () => true,
    refreshAfterWorldMutation: () => undefined,
    refreshOutliner: () => undefined,
    showStatus: () => undefined,
  };
}

/**
 * Creates a solid model with one named box brush in the world.
 *
 * @param world World group.
 * @param stack Command stack.
 * @param name Brush display name.
 * @param position Local brush position.
 * @returns Created model and brush id.
 */
function createNamedBrush(
  world: THREE.Group,
  stack: CommandStack,
  name: string,
  position: THREE.Vector3,
): { model: SolidModel; brushId: string } {
  const model = new SolidModel('CaptureModel');
  const brush = model.addBoxBrush(2, SolidOperation.Additive);
  brush.position.copy(position);
  brush.pushTransformToMesh();
  model.renameBrush(brush.id, name);
  model.rebuild(true);
  stack.push(new CommandSolidModelCreate(model, world));
  return { model, brushId: brush.id };
}

/**
 * Builds a minimal valid JPEG as base64 for marker tests.
 *
 * @returns Base64 string.
 */
function makeTinyJpegBase64(): string {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Returns whether lookAt lies on the camera optical axis (image center).
 *
 * @param position Camera position.
 * @param lookAt Subject point.
 * @param up Camera up.
 * @returns True when lookAt is centered.
 */
function lookAtIsOpticalCenter(position: THREE.Vector3, lookAt: THREE.Vector3, up: THREE.Vector3): boolean {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 5000);
  camera.position.copy(position);
  camera.up.copy(up);
  camera.lookAt(lookAt);
  camera.updateMatrixWorld(true);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const toTarget = lookAt.clone().sub(position).normalize();
  return forward.dot(toTarget) > 0.999;
}

/** Unit tests for offline AI capture helpers and framing. */
describe('EditorApi capture_view', () => {
  it('defaults and clamps capture resolution for MCP-safe sizes', () => {
    expect(clampCaptureResolution(undefined)).toBe(MCP_CAPTURE_DEFAULT_SIZE);
    expect(clampCaptureResolution(16)).toBe(32);
    expect(clampCaptureResolution(32)).toBe(32);
    expect(clampCaptureResolution(2048)).toBe(512);
    expect(clampCaptureResolution(256.9)).toBe(256);
  });

  it('halves size candidates from requested down to 32', () => {
    expect(buildSizeCandidates(512)).toEqual([512, 256, 128, 64, 32]);
    expect(buildSizeCandidates(256)).toEqual([256, 128, 64, 32]);
    expect(buildSizeCandidates(128)).toEqual([128, 64, 32]);
    expect(buildSizeCandidates(40)).toEqual([40, 32]);
  });

  it('keeps a hard base64 budget so MCP clients do not truncate images', () => {
    expect(MCP_CAPTURE_MAX_BASE64_CHARS).toBeLessThanOrEqual(16000);
  });

  it('flips RGBA rows from WebGL bottom-up to top-down', () => {
    const width = 2;
    const height = 2;
    const source = new Uint8Array([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255]);
    const flipped = flipRgbaPixelsVertically(source, width, height);
    expect(Array.from(flipped.subarray(0, 4))).toEqual([3, 0, 0, 255]);
    expect(Array.from(flipped.subarray(8, 12))).toEqual([1, 0, 0, 255]);
  });

  it('strips data-URL prefixes from image payloads', () => {
    const raw = stripDataUrlBase64Prefix('data:image/jpeg;base64,abc123');
    expect(raw).toBe('abc123');
  });

  it('validates complete JPEG base64 and rejects truncated garbage', () => {
    expect(isValidJpegBase64(makeTinyJpegBase64())).toBe(true);
    expect(isValidJpegBase64('not-valid!!')).toBe(false);
    expect(isValidJpegBase64(btoa('nope'))).toBe(false);
  });

  it('centers lookAt on a named brush and pulls back with distanceOffset', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(64);
    createNamedBrush(world, stack, 'wall_front', new THREE.Vector3(10, 1, 0));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const tight = resolveCaptureCameraPose(world, { nameContains: 'wall_front' }, camera);
    const pulled = resolveCaptureCameraPose(world, { nameContains: 'wall_front', distanceOffset: 5 }, camera);
    expect(tight.framingMode).toBe('brush_fit');
    expect(tight.framedBrushIds).toHaveLength(1);
    expect(tight.lookAt.x).toBeCloseTo(10, 2);
    expect(tight.lookAt.y).toBeCloseTo(1, 2);
    expect(lookAtIsOpticalCenter(tight.position, tight.lookAt, tight.up)).toBe(true);
    const tightDistance = tight.position.distanceTo(tight.lookAt);
    const pulledDistance = pulled.position.distanceTo(pulled.lookAt);
    expect(pulledDistance).toBeGreaterThan(tightDistance + 4.5);
  });

  it('front view places the camera on +Z looking at the brush center', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(64);
    createNamedBrush(world, stack, 'door', new THREE.Vector3(0, 2, 5));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const pose = resolveCaptureCameraPose(world, { nameContains: 'door', view: 'front' }, camera);
    expect(pose.lookAt.z).toBeCloseTo(5, 2);
    expect(pose.position.z).toBeGreaterThan(pose.lookAt.z);
    expect(Math.abs(pose.position.x - pose.lookAt.x)).toBeLessThan(0.25);
    expect(lookAtIsOpticalCenter(pose.position, pose.lookAt, pose.up)).toBe(true);
  });

  it('errors when nameContains matches nothing instead of framing the whole world', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(64);
    createNamedBrush(world, stack, 'floor', new THREE.Vector3(0, 0, 0));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    expect(() => resolveCaptureCameraPose(world, { nameContains: 'no_such_brush' }, camera)).toThrow(
      /no brushes matched/i,
    );
  });

  it('lookAt alone aims at that point without requiring brush ids', () => {
    const world = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const pose = resolveCaptureCameraPose(
      world,
      { lookAt: { x: 3, y: 4, z: 5 }, distanceOffset: 10, view: 'iso' },
      camera,
    );
    expect(pose.framingMode).toBe('look_at');
    expect(pose.lookAt.x).toBeCloseTo(3, 5);
    expect(pose.lookAt.y).toBeCloseTo(4, 5);
    expect(pose.lookAt.z).toBeCloseTo(5, 5);
    expect(pose.position.distanceTo(pose.lookAt)).toBeCloseTo(10, 4);
    expect(lookAtIsOpticalCenter(pose.position, pose.lookAt, pose.up)).toBe(true);
  });

  it('honors explicit position and lookAt', () => {
    const world = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const pose = resolveCaptureCameraPose(
      world,
      {
        position: { x: 0, y: 5, z: 10 },
        lookAt: { x: 0, y: 0, z: 0 },
      },
      camera,
    );
    expect(pose.framingMode).toBe('free');
    expect(pose.position.y).toBeCloseTo(5, 5);
    expect(pose.position.z).toBeCloseTo(10, 5);
    expect(pose.lookAt.x).toBeCloseTo(0, 5);
    expect(lookAtIsOpticalCenter(pose.position, pose.lookAt, pose.up)).toBe(true);
  });

  it('fails capture_view when scene/renderer are not wired', () => {
    const world = new THREE.Group();
    const api = new EditorApi(createTestHost(world));
    const result = api.invokeTool('capture_view', { size: 128 });
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain('scene');
    expect(result.message.toLowerCase()).toContain('start mcp');
  });

  it('frames multiple brush ids into a combined centered look-at', () => {
    const world = new THREE.Group();
    const stack = new CommandStack(64);
    const left = createNamedBrush(world, stack, 'left_prop', new THREE.Vector3(-4, 0, 0));
    const right = createNamedBrush(world, stack, 'right_prop', new THREE.Vector3(4, 0, 0));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const pose = resolveCaptureCameraPose(world, { brushIds: [left.brushId, right.brushId] }, camera);
    expect(pose.framedBrushIds).toHaveLength(2);
    expect(pose.lookAt.x).toBeCloseTo(0, 1);
    expect(lookAtIsOpticalCenter(pose.position, pose.lookAt, pose.up)).toBe(true);
  });
});
