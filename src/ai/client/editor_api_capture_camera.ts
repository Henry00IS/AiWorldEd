import * as THREE from 'three';
import {
  getDefaultPerspectiveCameraPosition,
  getDefaultSceneFocus,
} from '@/navigation/placement/default_camera_placement.js';
import type { CaptureViewArgs, CaptureViewSide } from './editor_api_capture_types.js';
import {
  cameraUpForView,
  fitCaptureCameraToMeshes,
  viewSideDirection,
} from '@/viewports/capture/offscreen_capture_fit.js';
import { dtoToVec3 } from './editor_api_math.js';
import { findBrush, findSolidModel, listSolidModels } from './editor_api_lookup.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import {
  offscreenCaptureLevelMeshes,
  offscreenCaptureMeshUsable,
  offscreenCaptureModelMeshes,
} from '@/viewports/capture/offscreen_capture_level.js';

/** Resolved camera pose for one offline capture. */
export interface CaptureCameraPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  up: THREE.Vector3;
  framedBrushIds: string[];
  framingMode: string;
}

/**
 * Resolves camera position and look-at for capture_view. Brush/model fit uses
 * the same mesh AABB + CameraFramer path as the editor F-key.
 *
 * @param worldObject Editor world root.
 * @param args Capture framing arguments.
 * @param camera Perspective camera (square aspect applied during fit).
 * @returns Pose and framed brush ids.
 */
export function resolveCaptureCameraPose(
  worldObject: THREE.Object3D,
  args: CaptureViewArgs,
  camera: THREE.PerspectiveCamera,
): CaptureCameraPose {
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  const framedBrushIds = collectFramedBrushIds(worldObject, args);
  if (hasBrushFocusArgs(args)) {
    return poseFromBrushFocus(worldObject, args, camera, framedBrushIds);
  }
  if (typeof args.modelId === 'string' && args.modelId.length > 0) {
    return poseFromModelFocus(worldObject, args, camera, args.modelId);
  }
  if (args.position) {
    return poseFromExplicitPosition(args);
  }
  if (args.lookAt) {
    return poseFromLookAtPoint(args, camera);
  }
  return poseFromWorldContent(worldObject, args, camera);
}

/**
 * Returns true when the AI asked to focus specific brushes.
 *
 * @param args Capture arguments.
 * @returns True when brush focus args are present.
 */
function hasBrushFocusArgs(args: CaptureViewArgs): boolean {
  if (typeof args.brushId === 'string' && args.brushId.length > 0) {
    return true;
  }
  if (Array.isArray(args.brushIds) && args.brushIds.some((id) => typeof id === 'string' && id.length > 0)) {
    return true;
  }
  if (typeof args.nameContains === 'string' && args.nameContains.trim().length > 0) {
    return true;
  }
  return false;
}

/**
 * Fits only the requested brush meshes (editor-style setFromObject bounds).
 *
 * @param worldObject Editor world root.
 * @param args Capture arguments.
 * @param camera Perspective camera.
 * @param framedBrushIds Resolved brush ids.
 * @returns Capture pose.
 */
function poseFromBrushFocus(
  worldObject: THREE.Object3D,
  args: CaptureViewArgs,
  camera: THREE.PerspectiveCamera,
  framedBrushIds: string[],
): CaptureCameraPose {
  if (framedBrushIds.length === 0) {
    throw new Error(
      'capture_view: no brushes matched brushId/brushIds/nameContains. Use find_brushes first, or pass an exact brushId.',
    );
  }
  const meshes = collectBrushMeshes(worldObject, framedBrushIds);
  if (meshes.length === 0) {
    throw new Error('capture_view: matched brushes have no meshes to frame');
  }
  const fit = fitCaptureCameraToMeshes(
    camera,
    meshes,
    resolveViewSide(args.view),
    args.padding ?? 1.2,
    args.distanceOffset,
  );
  return {
    position: fit.position,
    lookAt: fit.lookAt,
    up: fit.up,
    framedBrushIds,
    framingMode: 'brush_fit',
  };
}

/**
 * Fits one solid model's CSG result mesh (or additive brush meshes as
 * fallback).
 *
 * @param worldObject Editor world root.
 * @param args Capture arguments.
 * @param camera Perspective camera.
 * @param modelId Solid model uuid.
 * @returns Capture pose.
 */
function poseFromModelFocus(
  worldObject: THREE.Object3D,
  args: CaptureViewArgs,
  camera: THREE.PerspectiveCamera,
  modelId: string,
): CaptureCameraPose {
  const model = findSolidModel(worldObject, modelId);
  if (!model) {
    throw new Error(`capture_view: solid model not found: ${modelId}`);
  }
  const meshes = offscreenCaptureModelMeshes(model);
  if (meshes.length === 0) {
    throw new Error('capture_view: solid model has no visual meshes to frame');
  }
  const fit = fitCaptureCameraToMeshes(
    camera,
    meshes,
    resolveViewSide(args.view),
    args.padding ?? 1.2,
    args.distanceOffset,
  );
  return {
    position: fit.position,
    lookAt: fit.lookAt,
    up: fit.up,
    framedBrushIds: [],
    framingMode: 'model_fit',
  };
}

/**
 * Free camera from explicit position + lookAt/direction.
 *
 * @param args Capture arguments with position.
 * @returns Capture pose.
 */
function poseFromExplicitPosition(args: CaptureViewArgs): CaptureCameraPose {
  const position = dtoToVec3(args.position, getDefaultPerspectiveCameraPosition());
  const lookAt = resolveFreeLookAt(position, args);
  const up = new THREE.Vector3(0, 1, 0);
  if (typeof args.distanceOffset === 'number' && Number.isFinite(args.distanceOffset) && args.distanceOffset !== 0) {
    const away = position.clone().sub(lookAt).normalize();
    position.addScaledVector(away, args.distanceOffset);
  }
  return { position, lookAt, up, framedBrushIds: [], framingMode: 'free' };
}

/**
 * Places a view-side camera looking at an explicit world point.
 *
 * @param args Capture arguments with lookAt.
 * @param camera Perspective camera.
 * @returns Capture pose.
 */
function poseFromLookAtPoint(args: CaptureViewArgs, camera: THREE.PerspectiveCamera): CaptureCameraPose {
  void camera;
  const lookAt = dtoToVec3(args.lookAt, getDefaultSceneFocus());
  const view = resolveViewSide(args.view);
  const distance =
    typeof args.distanceOffset === 'number' && Number.isFinite(args.distanceOffset) && args.distanceOffset > 0
      ? args.distanceOffset
      : 8;
  const up = cameraUpForView(view);
  const position = lookAt.clone().addScaledVector(viewSideDirection(view), distance);
  return {
    position,
    lookAt,
    up,
    framedBrushIds: [],
    framingMode: 'look_at',
  };
}

/**
 * Fits all solid CSG results in the world.
 *
 * @param worldObject Editor world root.
 * @param args Capture arguments.
 * @param camera Perspective camera.
 * @returns Capture pose.
 */
function poseFromWorldContent(
  worldObject: THREE.Object3D,
  args: CaptureViewArgs,
  camera: THREE.PerspectiveCamera,
): CaptureCameraPose {
  const meshes = offscreenCaptureLevelMeshes(worldObject);
  if (meshes.length === 0) {
    return {
      position: getDefaultPerspectiveCameraPosition(),
      lookAt: getDefaultSceneFocus(),
      up: cameraUpForView('iso'),
      framedBrushIds: [],
      framingMode: 'default',
    };
  }
  const fit = fitCaptureCameraToMeshes(
    camera,
    meshes,
    resolveViewSide(args.view),
    args.padding ?? 1.2,
    args.distanceOffset,
  );
  return {
    position: fit.position,
    lookAt: fit.lookAt,
    up: fit.up,
    framedBrushIds: [],
    framingMode: 'world_fit',
  };
}

/**
 * Resolves free-camera look-at from lookAt or direction.
 *
 * @param position Camera position.
 * @param args Capture arguments.
 * @returns Look-at point.
 */
function resolveFreeLookAt(position: THREE.Vector3, args: CaptureViewArgs): THREE.Vector3 {
  if (args.lookAt) {
    return dtoToVec3(args.lookAt, getDefaultSceneFocus());
  }
  if (args.direction) {
    const direction = dtoToVec3(args.direction, new THREE.Vector3(0, 0, -1));
    if (direction.lengthSq() >= 1e-12) {
      return position.clone().add(direction.normalize());
    }
  }
  return getDefaultSceneFocus();
}

/**
 * Parses the view side argument with iso default.
 *
 * @param view Raw view value.
 * @returns CaptureViewSide.
 */
function resolveViewSide(view: CaptureViewSide | undefined): CaptureViewSide {
  if (
    view === 'front' ||
    view === 'back' ||
    view === 'top' ||
    view === 'bottom' ||
    view === 'left' ||
    view === 'right' ||
    view === 'iso'
  ) {
    return view;
  }
  return 'iso';
}

/**
 * Collects brush ids requested for framing.
 *
 * @param worldObject Editor world root.
 * @param args Capture arguments.
 * @returns Unique brush ids.
 */
export function collectFramedBrushIds(worldObject: THREE.Object3D, args: CaptureViewArgs): string[] {
  const ids = new Set<string>();
  if (typeof args.brushId === 'string' && args.brushId.length > 0) {
    ids.add(args.brushId);
  }
  if (Array.isArray(args.brushIds)) {
    for (const brushId of args.brushIds) {
      if (typeof brushId === 'string' && brushId.length > 0) {
        ids.add(brushId);
      }
    }
  }
  const needle = typeof args.nameContains === 'string' ? args.nameContains.trim().toLowerCase() : '';
  if (needle.length > 0) {
    for (const model of resolveModels(worldObject, args.modelId)) {
      for (const brush of model.getBrushes()) {
        if (brush.name.toLowerCase().includes(needle)) {
          ids.add(brush.id);
        }
      }
    }
  }
  return Array.from(ids);
}

/**
 * Collects live brush preview meshes for framing (same objects the editor
 * fits).
 *
 * @param worldObject Editor world root.
 * @param brushIds Brush ids.
 * @returns Meshes with usable geometry.
 */
function collectBrushMeshes(worldObject: THREE.Object3D, brushIds: readonly string[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const brushId of brushIds) {
    const found = findBrush(worldObject, brushId);
    if (!found?.brush.mesh) {
      continue;
    }
    found.brush.pullTransformFromMesh();
    found.model.root.updateMatrixWorld(true);
    if (offscreenCaptureMeshUsable(found.brush.mesh)) {
      meshes.push(found.brush.mesh);
    }
  }
  return meshes;
}

/**
 * Lists solid models, optionally filtered to one model id.
 *
 * @param worldObject Editor world root.
 * @param modelId Optional solid model uuid.
 * @returns Models to scan.
 */
function resolveModels(worldObject: THREE.Object3D, modelId: string | undefined): SolidModel[] {
  if (typeof modelId === 'string' && modelId.length > 0) {
    const model = findSolidModel(worldObject, modelId);
    return model ? [model] : [];
  }
  return listSolidModels(worldObject);
}
