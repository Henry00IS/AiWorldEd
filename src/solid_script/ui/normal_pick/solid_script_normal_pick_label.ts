import * as THREE from 'three';
import type { SolidScriptNormalPickFace } from './solid_script_normal_pick_model.js';

/** Pixels of the square texture a label is drawn in. */
const SOLID_SCRIPT_NORMAL_PICK_LABEL_PIXELS = 128;

/** Share of the face's inner circle the label square fills. */
const SOLID_SCRIPT_NORMAL_PICK_LABEL_FILL = 1.3;

/** How far a label floats in front of its face, in metres. */
const SOLID_SCRIPT_NORMAL_PICK_LABEL_LIFT = 0.004;

/**
 * Returns the middle of a face.
 *
 * @param loop Corners.
 * @returns Middle.
 */
export function solidScriptNormalPickLoopMiddle(loop: readonly THREE.Vector3[]): THREE.Vector3 {
  return loop.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(Math.max(1, loop.length));
}

/**
 * Builds the text of a face as a flat square lying on it, upright where it can
 * be, or nothing when the page cannot draw text.
 *
 * @param face Face.
 * @returns Label mesh, or null.
 */
export function solidScriptNormalPickLabel(face: SolidScriptNormalPickFace): THREE.Mesh | null {
  const texture = solidScriptNormalPickLabelTexture(face.direction.lines);
  if (!texture) return null;
  const middle = solidScriptNormalPickLoopMiddle(face.loop);
  const size = solidScriptNormalPickInnerRadius(face.loop, middle) * SOLID_SCRIPT_NORMAL_PICK_LABEL_FILL;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  label.quaternion.setFromRotationMatrix(solidScriptNormalPickLabelBasis(face.direction.unit));
  label.position.copy(middle).addScaledVector(face.direction.unit, SOLID_SCRIPT_NORMAL_PICK_LABEL_LIFT);
  return label;
}

/**
 * Returns the turn that lays a label on a face: its up along world up, or along
 * -Z on faces that look straight up or down.
 *
 * @param normal Unit face normal.
 * @returns Rotation matrix.
 */
function solidScriptNormalPickLabelBasis(normal: THREE.Vector3): THREE.Matrix4 {
  const flat = Math.abs(normal.y) > 0.9;
  const up = flat ? new THREE.Vector3(0, 0, normal.y > 0 ? -1 : 1) : new THREE.Vector3(0, 1, 0);
  up.addScaledVector(normal, -up.dot(normal)).normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  return new THREE.Matrix4().makeBasis(right, up, normal);
}

/**
 * Returns the distance from a face's middle to its nearest edge.
 *
 * @param loop Corners.
 * @param middle Middle.
 * @returns Distance.
 */
function solidScriptNormalPickInnerRadius(loop: readonly THREE.Vector3[], middle: THREE.Vector3): number {
  let nearest = Infinity;
  loop.forEach((start, index) => {
    const end = loop[(index + 1) % loop.length] ?? start;
    const closest = new THREE.Line3(start, end).closestPointToPoint(middle, true, new THREE.Vector3());
    nearest = Math.min(nearest, closest.distanceTo(middle));
  });
  return Number.isFinite(nearest) ? nearest : 0;
}

/**
 * Draws lines of text centred in a square texture.
 *
 * @param lines Lines.
 * @returns Texture, or null when the page cannot draw text.
 */
function solidScriptNormalPickLabelTexture(lines: readonly string[]): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = SOLID_SCRIPT_NORMAL_PICK_LABEL_PIXELS;
  canvas.height = SOLID_SCRIPT_NORMAL_PICK_LABEL_PIXELS;
  const context = solidScriptNormalPickCanvasContext(canvas);
  if (!context) return null;
  const size = SOLID_SCRIPT_NORMAL_PICK_LABEL_PIXELS;
  const height = lines.length > 1 ? size * 0.26 : size * 0.34;
  context.font = `bold ${Math.round(height)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(0, 0, 0, 0.85)';
  context.shadowBlur = 6;
  lines.forEach((line, index) =>
    context.fillText(line, size / 2, size / 2 + (index - (lines.length - 1) / 2) * height * 1.1, size * 0.96),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Returns the 2D drawing context of a canvas, or null where the page has none.
 *
 * @param canvas Canvas.
 * @returns Context, or null.
 */
function solidScriptNormalPickCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}
