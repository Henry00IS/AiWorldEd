import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { isResultMesh } from '@/solid/model/solid_model_keys.js';
import { getTriangleCount } from '@/selection/pick/utils_triangle_geometry.js';
import { SnapPolicy } from '@/snap/policy/snap_policy.js';
import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { buildSnapAlignCache, SnapAlignCache } from '@/snap/tool/snap_align_cache.js';
import type { SnapAlignHost } from '@/snap/tool/snap_align_host.js';
import { HandlerFaceAlign } from '@/snap/tool/handler_face_align.js';
import { HandlerHingeAlign } from '@/snap/tool/handler_hinge_align.js';
import { createHingeSnapPolicy } from '@/snap/tool/snap_hinge_policy.js';
import type { SnapQueryRequest } from '@/snap/query/snap_query_request.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';

/**
 * Fixed pick element whose layout size and bounds are 200 by 200.
 *
 * @returns Pick element.
 */
function createPickElement(): HTMLElement {
  const element = document.createElement('div');
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(element, 'clientWidth', { value: 200 });
  Object.defineProperty(element, 'clientHeight', { value: 200 });
  return element;
}

/**
 * Orthographic camera looking down the negative Z axis.
 *
 * @returns Camera.
 */
function createAlignCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 40);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Builds a host that records live and committed solid refreshes.
 *
 * @param world Scene root.
 * @param camera Viewport camera.
 * @param onCommitted Callback after a committed refresh is recorded.
 * @param selected Roots reported as the current selection.
 * @returns Host and the recorded calls.
 */
function createHost(
  world: THREE.Object3D,
  camera: THREE.Camera,
  onCommitted?: (meshes: readonly THREE.Mesh[], textureLocks?: TextureLockFlags) => void,
  selected: readonly THREE.Object3D[] = [],
): {
  host: SnapAlignHost;
  scene: THREE.Scene;
  live: number;
  committed: THREE.Mesh[][];
  status: string[];
  stack: CommandStack;
} {
  const committed: THREE.Mesh[][] = [];
  const status: string[] = [];
  const stack = new CommandStack(32);
  const scene = new THREE.Scene();
  let live = 0;
  const viewport = {
    getContentElement: () => createPickElement(),
    getCamera: () => camera,
  } as ViewportEditor;
  const host: SnapAlignHost = {
    worldObject: world,
    commandStack: stack,
    getViewports: () => [viewport],
    getPrimaryScene: () => scene,
    getSelectedRoots: () => selected,
    showStatusMessage: (message) => {
      status.push(message);
    },
    notifySolidTransformsLive: () => {
      live += 1;
    },
    notifySolidTransformsCommitted: (meshes, textureLocks) => {
      committed.push([...meshes]);
      onCommitted?.(meshes, textureLocks);
    },
    basePolicy: new SnapPolicy(),
    beginAlignChrome: () => undefined,
    endAlignChrome: () => undefined,
  };
  return {
    host,
    scene,
    get live() {
      return live;
    },
    committed,
    status,
    stack,
  };
}

/**
 * Returns the brush preview mesh.
 *
 * @param brush Brush instance.
 * @returns Preview mesh.
 */
function brushMesh(brush: SolidBrushInstance): THREE.Mesh {
  const mesh = brush.mesh;
  if (!mesh) {
    throw new Error('brush mesh missing');
  }
  return mesh;
}

/**
 * Compiles two separated brushes so the result mesh is the visible surface.
 *
 * @returns Model and the near and far brushes.
 */
function compiledPair(): { model: SolidModel; near: SolidBrushInstance; far: SolidBrushInstance } {
  const pair = twoBrushesOnOneRay();
  pair.model.markDirty();
  pair.model.rebuild(true);
  pair.model.root.updateMatrixWorld(true);
  return pair;
}

/**
 * Places two box brushes on the same view ray, the second farther from the
 * camera.
 *
 * @returns Model, near brush, and far brush.
 */
function twoBrushesOnOneRay(): { model: SolidModel; near: SolidBrushInstance; far: SolidBrushInstance } {
  const model = new SolidModel('AlignPair');
  const near = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  const far = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  near.position.set(0, 0, 1);
  near.pushTransformToMesh();
  far.position.set(0, 0, -2);
  far.pushTransformToMesh();
  model.root.updateMatrixWorld(true);
  return { model, near, far };
}

describe('face align and seat completion', () => {
  it('accepts a farther brush in the same solid and leaves the live rebuild idle', () => {
    const camera = createAlignCamera();
    const { model, near, far } = twoBrushesOnOneRay();
    const source = brushMesh(near);
    const target = brushMesh(far);
    const start = source.quaternion.clone();
    const { host, live, committed, status } = createHost(model.root, camera);
    const handler = new HandlerFaceAlign(host, 'align', buildSnapAlignCache(model.root));
    handler.arm();
    handler.tryClick(100, 100, null);
    handler.updateHover(100, 100, null);
    handler.tryClick(100, 100, null);
    expect(handler.isArmed()).toBe(false);
    expect(source.quaternion.angleTo(start)).toBeGreaterThan(1);
    expect(target.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
    expect(live).toBe(0);
    expect(committed).toEqual([[source]]);
    expect(status.some((message) => message.includes('another object'))).toBe(false);
  });

  it('does not commit a second click on the same brush', () => {
    const camera = createAlignCamera();
    const model = new SolidModel('AlignOne');
    const only = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    only.pushTransformToMesh();
    model.root.updateMatrixWorld(true);
    const source = brushMesh(only);
    const { host, live, committed, status } = createHost(model.root, camera);
    const handler = new HandlerFaceAlign(host, 'seat', buildSnapAlignCache(model.root));
    handler.arm();
    handler.tryClick(100, 100, null);
    handler.tryClick(100, 100, null);
    expect(handler.isArmed()).toBe(true);
    expect(source.position.z).toBeCloseTo(0);
    expect(live).toBe(0);
    expect(committed).toEqual([]);
    expect(status.at(-1)).toContain('another object');
  });

  it('seats onto the face behind the source brush', () => {
    const camera = createAlignCamera();
    const { model, near } = twoBrushesOnOneRay();
    const source = brushMesh(near);
    const start = source.position.z;
    const { host, live, committed } = createHost(model.root, camera);
    const handler = new HandlerFaceAlign(host, 'seat', buildSnapAlignCache(model.root));
    handler.arm();
    handler.tryClick(100, 100, null);
    handler.tryClick(100, 100, null);
    expect(handler.isArmed()).toBe(false);
    expect(source.position.z).toBeLessThan(start - 0.5);
    expect(source.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
    expect(live).toBe(0);
    expect(committed).toEqual([[source]]);
  });
});

describe('visible solid faces', () => {
  it('picks the compiled face under the ray and the brush that authored it', () => {
    const { model, near, far } = compiledPair();
    const cache = buildSnapAlignCache(model.root);
    const front = cache.pickFace(new THREE.Vector3(0, 0, 8), new THREE.Vector3(0, 0, -1), null);
    const nearMesh = brushMesh(near);
    expect(front?.mesh && isResultMesh(front.mesh)).toBe(true);
    expect(front?.root).toBe(nearMesh);
    expect(front?.point.z).toBeGreaterThan(1);
    expect(front && front.faceIndex < getTriangleCount(front.mesh.geometry)).toBe(true);
    const behind = cache.pickFace(
      new THREE.Vector3(0, 0, 8),
      new THREE.Vector3(0, 0, -1),
      null,
      new Set([nearMesh.uuid]),
    );
    expect(behind?.root).toBe(brushMesh(far));
    expect(behind?.mesh).toBe(front?.mesh);
  });

  it('moves the authored brush when the second click hits the compiled solid', () => {
    const camera = createAlignCamera();
    const { model, near } = compiledPair();
    const source = brushMesh(near);
    const result = model.getResultMesh();
    const start = source.quaternion.clone();
    const { host, live } = createHost(model.root, camera);
    const handler = new HandlerFaceAlign(host, 'align', buildSnapAlignCache(model.root));
    handler.arm();
    handler.tryClick(100, 100, null);
    handler.tryClick(100, 100, null);
    expect(handler.isArmed()).toBe(false);
    expect(source.quaternion.angleTo(start)).toBeGreaterThan(1);
    expect(result.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
    expect(live).toBe(0);
  });
});

describe('hinge edge highlight', () => {
  it('draws the edge under the pointer and keeps it after the hinge is chosen', () => {
    const camera = createAlignCamera();
    const model = new SolidModel('HingeLine');
    const brush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    brush.pushTransformToMesh();
    model.root.updateMatrixWorld(true);
    const aim = new THREE.Vector3(0.5, 0, 0.5).project(camera);
    const clientX = (aim.x * 0.5 + 0.5) * 200;
    const clientY = (-aim.y * 0.5 + 0.5) * 200;
    const { host, scene } = createHost(model.root, camera);
    const handler = new HandlerHingeAlign(host, buildSnapAlignCache(model.root));
    handler.arm();
    handler.updateHover(clientX, clientY, null);
    const line = scene.getObjectByName('preview_snap_align_edge');
    expect(line?.visible).toBe(true);
    handler.tryClick(clientX, clientY, null);
    expect(scene.getObjectByName('preview_snap_align_edge')?.visible).toBe(true);
    handler.cancel();
    expect(scene.getObjectByName('preview_snap_align_edge')?.visible).toBe(false);
  });
});

describe('hinge rider edge', () => {
  it('rejects a second edge on another object and keeps the hinge', () => {
    const camera = createAlignCamera();
    const world = new THREE.Group();
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const landing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    landing.position.set(3, 0, 0);
    world.add(bridge);
    world.add(landing);
    world.updateMatrixWorld(true);
    const hingeAim = new THREE.Vector3(0.5, 0, 0.5).project(camera);
    const otherAim = new THREE.Vector3(3.5, 0, 0.5).project(camera);
    const { host, status } = createHost(world, camera);
    const handler = new HandlerHingeAlign(host, buildSnapAlignCache(world));
    handler.arm();
    handler.tryClick((hingeAim.x * 0.5 + 0.5) * 200, (-hingeAim.y * 0.5 + 0.5) * 200, null);
    handler.tryClick((otherAim.x * 0.5 + 0.5) * 200, (-otherAim.y * 0.5 + 0.5) * 200, null);
    expect(handler.isArmed()).toBe(true);
    expect(status.at(-1)).toContain('this object');
    expect(bridge.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
  });
});

describe('hinge commit and undo', () => {
  it('skips live rebuilds, commits once, and restores the face surface on undo', () => {
    const camera = createAlignCamera();
    const model = new SolidModel('HingeBrush');
    const brush = model.addBoxBrush(1, SolidOperation.Additive, null, false);
    brush.pushTransformToMesh();
    brush.setFaceTextureId(0, 'rigid-uv');
    model.root.updateMatrixWorld(true);
    const mesh = brushMesh(brush);
    const aim = new THREE.Vector3(0.5, 0, 0.5).project(camera);
    const clientX = (aim.x * 0.5 + 0.5) * 200;
    const clientY = (-aim.y * 0.5 + 0.5) * 200;
    const { host, live, committed, stack } = createHost(model.root, camera, () => {
      brush.setFaceTextureId(0, 'distorted-uv');
    });
    const handler = new HandlerHingeAlign(host, buildSnapAlignCache(model.root));
    const farAim = new THREE.Vector3(-0.5, 0, 0.5).project(camera);
    const farX = (farAim.x * 0.5 + 0.5) * 200;
    const farY = (-farAim.y * 0.5 + 0.5) * 200;
    handler.arm();
    handler.tryClick(clientX, clientY, null);
    expect(handler.isArmed()).toBe(true);
    expect(mesh.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
    handler.tryClick(farX, farY, null);
    expect(handler.isArmed()).toBe(true);
    expect(mesh.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
    handler.tryClick(farX, farY, null);
    expect(handler.isArmed()).toBe(false);
    expect(live).toBe(0);
    expect(committed).toHaveLength(1);
    expect(brush.getSurfaceTextureId(0)).toBe('distorted-uv');
    expect(stack.undo()).toBe(true);
    expect(brush.getSurfaceTextureId(0)).toBe('rigid-uv');
    expect(mesh.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-4);
  });
});

describe('snap align cache', () => {
  it('returns the cached vertex after the live positions move', () => {
    const mesh = triangleMesh([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const world = new THREE.Group();
    world.add(mesh);
    const cache = buildSnapAlignCache(world);
    const position = mesh.geometry.getAttribute('position');
    position.setXYZ(0, 40, 40, 40);
    const hit = cache.queryPreferringVertex(queryAt(new THREE.Vector3(0, 0, 0), new Set()));
    expect(hit?.kind).toBe('vertex');
    expect(hit?.point.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-4);
  });

  it('chooses a vertex inside the radius over a closer edge', () => {
    const mesh = triangleMesh([0, 0, 0, 4, 0, 0, 0, 4, 0]);
    const world = new THREE.Group();
    world.add(mesh);
    const cache = buildSnapAlignCache(world);
    const request = queryAt(new THREE.Vector3(0.5, 0, 0), new Set());
    expect(cache.query(request)?.kind).toBe('edge');
    expect(cache.queryPreferringVertex(request)?.kind).toBe('vertex');
  });

  it('returns the face behind an excluded mesh', () => {
    const source = triangleMesh([-1, -1, 1, 1, -1, 1, 0, 1, 1]);
    const target = triangleMesh([-1, -1, -1, 1, -1, -1, 0, 1, -1]);
    const world = new THREE.Group();
    world.add(source);
    world.add(target);
    const cache = new SnapAlignCache().build(world);
    const front = cache.pickFace(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1), null);
    const behind = cache.pickFace(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1), source);
    expect(front?.mesh).toBe(source);
    expect(behind?.mesh).toBe(target);
  });
});

describe('hinge brush target', () => {
  it('moves only the authored brush when nothing is selected', () => {
    expectAuthoredBrushOnly([]);
  });

  it('moves only the authored brush when that brush is selected', () => {
    const scene = separatedHingeBrushes();
    expectAuthoredBrushOnly([brushMesh(scene.moving)], scene);
  });

  it('moves only the authored brush when the solid result is selected', () => {
    const scene = separatedHingeBrushes();
    expectAuthoredBrushOnly([scene.model.getResultMesh()], scene);
  });
});

describe('hinge parallel landing', () => {
  it('rotates about the hinge and keeps the scaled cube size', () => {
    const scene = reportedHingeScene();
    const riderRadius = lineDistance(scene.rider.start, scene.hinge);
    const stack = commitReportedHinge(scene);
    scene.scaled.updateMatrixWorld(true);
    expect(scene.scaled.scale.distanceTo(scene.startScale)).toBeLessThan(1e-6);
    expect(worldOf(scene.scaled, scene.hinge.localStart).distanceTo(scene.hinge.start)).toBeLessThan(1e-4);
    expect(worldOf(scene.scaled, scene.hinge.localEnd).distanceTo(scene.hinge.end)).toBeLessThan(1e-4);
    expect(lineDistance(worldOf(scene.scaled, scene.rider.localStart), scene.hinge)).toBeCloseTo(riderRadius, 4);
    expect(lineDistance(worldOf(scene.scaled, scene.rider.localEnd), scene.hinge)).toBeCloseTo(riderRadius, 4);
    expect(offsetsPointTheSameWay(worldOf(scene.scaled, scene.rider.localStart), scene.target.start, scene.hinge)).toBe(
      true,
    );
    expect(stack.undo()).toBe(true);
    expect(scene.scaled.scale.distanceTo(scene.startScale)).toBeLessThan(1e-4);
    expect(scene.scaled.position.distanceTo(scene.startPosition)).toBeLessThan(1e-4);
  });
});

describe('hinge rotation only', () => {
  it('swings the far edge toward the target without scaling or rewriting face UVs', () => {
    const scene = separatedHingeBrushes();
    const swing = captureFarEdgeSwing(scene);
    const received = commitFarEdgeSwing(scene);
    expectFarEdgeSwing(scene, swing, received);
  });
});

/**
 * Hinges the origin brush and checks that the other brush stays put.
 *
 * @param selected Selection passed to the handler.
 * @param scene Prepared brushes. A new pair is built when omitted.
 */
function expectAuthoredBrushOnly(
  selected: readonly THREE.Object3D[],
  scene: SeparatedHingeBrushes = separatedHingeBrushes(),
): void {
  const stillStart = worldPosition(brushMesh(scene.still));
  const movingStart = worldPosition(brushMesh(scene.moving));
  const committed = commitSeparatedHinge(scene, selected);
  expect(worldPosition(brushMesh(scene.still)).distanceTo(stillStart)).toBeLessThan(1e-4);
  expect(scene.model.root.position.length()).toBeLessThan(1e-4);
  expect(scene.model.root.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-4);
  expect(scene.model.getResultMesh().position.length()).toBeLessThan(1e-4);
  expect(worldPosition(brushMesh(scene.moving)).distanceTo(movingStart)).toBeGreaterThan(0.1);
  expect(committed).toEqual([[brushMesh(scene.moving)]]);
}

/** Two brushes in one solid and the edges the hinge clicks. */
interface SeparatedHingeBrushes {
  model: SolidModel;
  moving: SolidBrushInstance;
  still: SolidBrushInstance;
}

/**
 * Builds two separated brushes and compiles the solid.
 *
 * @returns Scene whose origin brush is the one that should hinge.
 */
function separatedHingeBrushes(): SeparatedHingeBrushes {
  const model = new SolidModel('HingePair');
  const moving = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  const still = model.addBoxBrush(1, SolidOperation.Additive, null, false);
  moving.pushTransformToMesh();
  still.position.set(3, 0, 0);
  still.pushTransformToMesh();
  model.markDirty();
  model.rebuild(true);
  model.root.updateMatrixWorld(true);
  return { model, moving, still };
}

/**
 * Clicks a depth edge on each brush and commits the hinge.
 *
 * @param scene Separated brushes.
 * @param selected Selection passed to the handler.
 * @param onCommitted Callback after the committed refresh is recorded.
 * @returns Brush meshes published at commit.
 */
function commitSeparatedHinge(
  scene: SeparatedHingeBrushes,
  selected: readonly THREE.Object3D[],
  onCommitted?: (meshes: readonly THREE.Mesh[], textureLocks?: TextureLockFlags) => void,
): THREE.Mesh[][] {
  const camera = createAlignCamera();
  const { host, committed } = createHost(scene.model.root, camera, onCommitted, selected);
  const handler = new HandlerHingeAlign(host, buildSnapAlignCache(scene.model.root));
  handler.arm();
  clickWorld(handler, camera, new THREE.Vector3(0.5, 0.5, 0));
  clickWorld(handler, camera, new THREE.Vector3(-0.5, -0.5, 0));
  clickWorld(handler, camera, new THREE.Vector3(3.5, 0.5, 0));
  expect(handler.isArmed()).toBe(false);
  return committed;
}

/**
 * Clicks a world point through the front camera.
 *
 * @param handler Hinge handler.
 * @param camera Front camera.
 * @param point World point.
 */
function clickWorld(handler: HandlerHingeAlign, camera: THREE.Camera, point: THREE.Vector3): void {
  const aim = point.clone().project(camera);
  handler.tryClick((aim.x * 0.5 + 0.5) * 200, (-aim.y * 0.5 + 0.5) * 200, null);
}

/**
 * Reads an object's world position.
 *
 * @param object Scene object.
 * @returns World position.
 */
function worldPosition(object: THREE.Object3D): THREE.Vector3 {
  object.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
}

/** Front-view edge stored before a hinge motion. */
interface ReportedEdge {
  start: THREE.Vector3;
  end: THREE.Vector3;
  localStart: THREE.Vector3;
  localEnd: THREE.Vector3;
}

/** Reported cubes and the edges the hinge click selects. */
interface ReportedHingeScene {
  world: THREE.Group;
  camera: THREE.OrthographicCamera;
  scaled: THREE.Mesh;
  hinge: ReportedEdge;
  rider: ReportedEdge;
  target: ReportedEdge;
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startScale: THREE.Vector3;
}

/**
 * Builds the reported cubes under a front camera.
 *
 * @returns Scene ready for hinge clicks.
 */
function reportedHingeScene(): ReportedHingeScene {
  const camera = createAlignCamera();
  const scaled = reportedScaledCube();
  const tilted = reportedTiltedCube();
  const world = new THREE.Group();
  world.add(scaled);
  world.add(tilted);
  world.updateMatrixWorld(true);
  return assembleReportedScene(world, camera, scaled, tilted);
}

/**
 * Builds the scaled cube from the reported pose.
 *
 * @returns Mesh.
 */
function reportedScaledCube(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.position.set(1.48061, 0.79892, 0);
  mesh.rotation.set(0, 0, THREE.MathUtils.degToRad(19.93091));
  mesh.scale.set(1.25, 0.4, 1);
  return mesh;
}

/**
 * Builds the tilted cube at the origin.
 *
 * @returns Mesh.
 */
function reportedTiltedCube(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.rotation.set(THREE.MathUtils.degToRad(90), THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(-90));
  return mesh;
}

/**
 * Assembles the scene record from placed meshes.
 *
 * @param world World root.
 * @param camera Front camera.
 * @param scaled Scaled cube.
 * @param tilted Tilted cube.
 * @returns Scene record.
 */
function assembleReportedScene(
  world: THREE.Group,
  camera: THREE.OrthographicCamera,
  scaled: THREE.Mesh,
  tilted: THREE.Mesh,
): ReportedHingeScene {
  return {
    world,
    camera,
    scaled,
    hinge: storedExtreme(scaled, camera, [1.25, 0.4, 1], 1),
    rider: storedExtreme(scaled, camera, [1.25, 0.4, 1], -1),
    target: storedExtreme(tilted, camera, [1], 1),
    startPosition: scaled.position.clone(),
    startQuaternion: scaled.quaternion.clone(),
    startScale: scaled.scale.clone(),
  };
}

/**
 * Clicks the hinge, the rider, and the target.
 *
 * @param scene Reported scene.
 * @returns Command stack after the commit.
 */
function commitReportedHinge(scene: ReportedHingeScene): CommandStack {
  const { host, stack } = createHost(scene.world, scene.camera);
  const handler = new HandlerHingeAlign(host, buildSnapAlignCache(scene.world));
  handler.arm();
  clickEdge(handler, scene.camera, scene.hinge);
  clickEdge(handler, scene.camera, scene.rider);
  clickEdge(handler, scene.camera, scene.target);
  expect(handler.isArmed()).toBe(false);
  return stack;
}

/**
 * Clicks the midpoint of an edge.
 *
 * @param handler Hinge handler.
 * @param camera Camera used to project the edge.
 * @param edge Edge to click.
 */
function clickEdge(handler: HandlerHingeAlign, camera: THREE.Camera, edge: ReportedEdge): void {
  const midpoint = edge.start.clone().add(edge.end).multiplyScalar(0.5);
  const aim = midpoint.project(camera);
  handler.tryClick((aim.x * 0.5 + 0.5) * 200, (-aim.y * 0.5 + 0.5) * 200, null);
}

/**
 * Picks a front-view extreme edge and stores its local endpoints.
 *
 * @param mesh Mesh that owns the edge.
 * @param camera Front camera.
 * @param lengths Accepted edge lengths.
 * @param sign 1 for the maximum screen score and -1 for the minimum.
 * @returns Stored edge.
 */
function storedExtreme(mesh: THREE.Mesh, camera: THREE.Camera, lengths: readonly number[], sign: number): ReportedEdge {
  const chosen = extremeSegment(worldCorners(mesh), lengths, camera, sign);
  const inverse = mesh.matrixWorld.clone().invert();
  return {
    start: chosen.start.clone(),
    end: chosen.end.clone(),
    localStart: chosen.start.clone().applyMatrix4(inverse),
    localEnd: chosen.end.clone().applyMatrix4(inverse),
  };
}

/**
 * Picks the segment with the greatest or least screen score.
 *
 * @param corners World corners.
 * @param lengths Accepted edge lengths.
 * @param camera Front camera.
 * @param sign 1 for the maximum and -1 for the minimum.
 * @returns Winning segment.
 */
function extremeSegment(
  corners: readonly THREE.Vector3[],
  lengths: readonly number[],
  camera: THREE.Camera,
  sign: number,
): { start: THREE.Vector3; end: THREE.Vector3 } {
  const edges = segmentsOfLengths(corners, lengths);
  const first = edges[0];
  if (!first) {
    throw new Error('box has no edges');
  }
  return edges.reduce(
    (best, edge) => (segmentScore(edge, camera) * sign > segmentScore(best, camera) * sign ? edge : best),
    first,
  );
}

/**
 * Screen score of a segment midpoint.
 *
 * @param edge Segment to score.
 * @param camera Front camera.
 * @returns Sum of normalized screen X and Y.
 */
function segmentScore(edge: { start: THREE.Vector3; end: THREE.Vector3 }, camera: THREE.Camera): number {
  const midpoint = edge.start.clone().add(edge.end).multiplyScalar(0.5).project(camera);
  return midpoint.x + midpoint.y;
}

/**
 * Collects segments whose length matches one accepted length.
 *
 * @param corners World corners.
 * @param lengths Accepted lengths.
 * @returns Matching segments.
 */
function segmentsOfLengths(
  corners: readonly THREE.Vector3[],
  lengths: readonly number[],
): { start: THREE.Vector3; end: THREE.Vector3 }[] {
  const edges: { start: THREE.Vector3; end: THREE.Vector3 }[] = [];
  for (let first = 0; first < corners.length; first += 1) {
    appendReportedEdges(edges, corners, first, lengths);
  }
  return edges;
}

/**
 * Appends segments that start at one corner.
 *
 * @param edges Output segments.
 * @param corners World corners.
 * @param first Index of the start corner.
 * @param lengths Accepted lengths.
 */
function appendReportedEdges(
  edges: { start: THREE.Vector3; end: THREE.Vector3 }[],
  corners: readonly THREE.Vector3[],
  first: number,
  lengths: readonly number[],
): void {
  const start = corners[first];
  if (!start) {
    return;
  }
  for (let second = first + 1; second < corners.length; second += 1) {
    appendReportedEdge(edges, start, corners[second], lengths);
  }
}

/**
 * Appends one segment when its length is accepted.
 *
 * @param edges Output segments.
 * @param start Segment start.
 * @param end Segment end, if present.
 * @param lengths Accepted lengths.
 */
function appendReportedEdge(
  edges: { start: THREE.Vector3; end: THREE.Vector3 }[],
  start: THREE.Vector3,
  end: THREE.Vector3 | undefined,
  lengths: readonly number[],
): void {
  if (!end || !lengths.some((length) => Math.abs(start.distanceTo(end) - length) < 1e-3)) {
    return;
  }
  edges.push({ start: start.clone(), end: end.clone() });
}

/**
 * Reads unique world corners.
 *
 * @param mesh Mesh to read.
 * @returns World corners.
 */
function worldCorners(mesh: THREE.Mesh): THREE.Vector3[] {
  const positions = mesh.geometry.getAttribute('position');
  const corners: THREE.Vector3[] = [];
  if (!positions) {
    return corners;
  }
  for (let index = 0; index < positions.count; index += 1) {
    pushUniqueCorner(corners, new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld));
  }
  return corners;
}

/**
 * Appends a corner when it is not already present.
 *
 * @param corners Collected corners.
 * @param point Candidate corner.
 */
function pushUniqueCorner(corners: THREE.Vector3[], point: THREE.Vector3): void {
  if (corners.some((corner) => corner.distanceToSquared(point) < 1e-10)) {
    return;
  }
  corners.push(point);
}

/**
 * Transforms a local point by the mesh world matrix.
 *
 * @param mesh Mesh to read.
 * @param local Local point.
 * @returns World point.
 */
function worldOf(mesh: THREE.Mesh, local: THREE.Vector3): THREE.Vector3 {
  return local.clone().applyMatrix4(mesh.matrixWorld);
}

/**
 * Distance from a point to the infinite line of an edge.
 *
 * @param point World point.
 * @param edge Edge that defines the line.
 * @returns Distance.
 */
function lineDistance(point: THREE.Vector3, edge: { start: THREE.Vector3; end: THREE.Vector3 }): number {
  return perpendicularToEdge(point, edge).length();
}

/**
 * Returns the part of a point that sticks out from an edge line.
 *
 * @param point World point.
 * @param edge Edge that defines the line.
 * @returns Perpendicular offset.
 */
function perpendicularToEdge(point: THREE.Vector3, edge: { start: THREE.Vector3; end: THREE.Vector3 }): THREE.Vector3 {
  const direction = edge.end.clone().sub(edge.start).normalize();
  const offset = point.clone().sub(edge.start);
  return offset.addScaledVector(direction, -offset.dot(direction));
}

/**
 * Returns whether two points sit on the same ray out from an edge.
 *
 * @param point Swung point.
 * @param target Landing point.
 * @param edge Hinge line.
 * @returns True when the perpendicular offsets are parallel and same-facing.
 */
function offsetsPointTheSameWay(
  point: THREE.Vector3,
  target: THREE.Vector3,
  edge: { start: THREE.Vector3; end: THREE.Vector3 },
): boolean {
  const pointOffset = perpendicularToEdge(point, edge);
  const targetOffset = perpendicularToEdge(target, edge);
  if (pointOffset.clone().cross(targetOffset).length() > 1e-3) {
    return false;
  }
  return pointOffset.dot(targetOffset) > 0;
}

/** Local samples of the far edge before a hinge. */
interface FarEdgeSwing {
  uvBefore: SurfaceUvMatrix;
  localRider: THREE.Vector3;
  localHinge: THREE.Vector3;
  radius: number;
  hinge: THREE.Vector3;
  target: THREE.Vector3;
  axis: { start: THREE.Vector3; end: THREE.Vector3 };
}

/**
 * Stores the far edge and a tilted face UV before the hinge runs.
 *
 * @param scene Separated brushes.
 * @returns Samples measured on the start pose.
 */
function captureFarEdgeSwing(scene: SeparatedHingeBrushes): FarEdgeSwing {
  const mesh = brushMesh(scene.moving);
  assignTiltedFaceUv(scene.moving);
  const hinge = new THREE.Vector3(0.5, 0.5, 0);
  const rider = new THREE.Vector3(-0.5, -0.5, 0);
  const axis = { start: hinge.clone(), end: hinge.clone().add(new THREE.Vector3(0, 0, 1)) };
  return {
    uvBefore: scene.moving.getFaceSurface(0).uv.clone(),
    localRider: mesh.worldToLocal(rider.clone()),
    localHinge: mesh.worldToLocal(hinge.clone()),
    radius: lineDistance(rider, axis),
    hinge,
    target: new THREE.Vector3(3.5, 0.5, 0),
    axis,
  };
}

/**
 * Writes a tilted UV matrix onto the first face.
 *
 * @param brush Brush that will rotate.
 */
function assignTiltedFaceUv(brush: SolidBrushInstance): void {
  const surface = brush.getFaceSurface(0);
  surface.uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0.2, 0.35), brush.faceNormalLocal(0), 37, 1.7, 0.6);
  brush.setFaceSurface(0, surface);
}

/**
 * Commits the far-edge hinge and applies the locks the tool requested.
 *
 * @param scene Separated brushes.
 * @returns Lock flags seen at commit.
 */
function commitFarEdgeSwing(scene: SeparatedHingeBrushes): TextureLockFlags[] {
  const received: TextureLockFlags[] = [];
  commitSeparatedHinge(scene, [], (meshes, locks) => {
    const flags = locks ?? { positionLock: false, stretchLock: false };
    received.push(flags);
    scene.model.prepareLiveBrushEdit(meshes, flags);
  });
  return received;
}

/**
 * Checks size, hinge, swing direction, UV, and the stick locks.
 *
 * @param scene Separated brushes.
 * @param swing Samples from before the hinge.
 * @param received Lock flags seen at commit.
 */
function expectFarEdgeSwing(scene: SeparatedHingeBrushes, swing: FarEdgeSwing, received: TextureLockFlags[]): void {
  const mesh = brushMesh(scene.moving);
  mesh.updateMatrixWorld(true);
  const riderAfter = swing.localRider.clone().applyMatrix4(mesh.matrixWorld);
  const hingeAfter = swing.localHinge.clone().applyMatrix4(mesh.matrixWorld);
  expect(mesh.scale.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-6);
  expect(hingeAfter.distanceTo(swing.hinge)).toBeLessThan(1e-4);
  expect(lineDistance(riderAfter, swing.axis)).toBeCloseTo(swing.radius, 4);
  expect(offsetsPointTheSameWay(riderAfter, swing.target, swing.axis)).toBe(true);
  expect(scene.moving.getFaceSurface(0).uv.equals(swing.uvBefore)).toBe(true);
  expect(received).toEqual([{ positionLock: true, stretchLock: true }]);
}

/**
 * Builds a single triangle mesh.
 *
 * @param coordinates Nine position components.
 * @returns Mesh.
 */
function triangleMesh(coordinates: number[]): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a hinge query aimed at a world point on the align camera.
 *
 * @param point World point under the pointer.
 * @param excludedRootIds Roots to omit.
 * @returns Query.
 */
function queryAt(point: THREE.Vector3, excludedRootIds: ReadonlySet<string>): SnapQueryRequest {
  const camera = createAlignCamera();
  const projected = point.clone().project(camera);
  const pointer = new THREE.Vector2((projected.x * 0.5 + 0.5) * 200, (-projected.y * 0.5 + 0.5) * 200);
  return {
    policy: createHingeSnapPolicy(),
    camera,
    pointerPixels: pointer,
    viewportWidth: 200,
    viewportHeight: 200,
    rayOrigin: new THREE.Vector3(point.x, point.y, 12),
    rayDirection: new THREE.Vector3(0, 0, -1),
    worldRoot: new THREE.Group(),
    excludedRootIds,
    excludedElementIds: new Set(),
  };
}
