import * as THREE from 'three';
import { levelNoteWorldPerPixel } from './level_note_screen.js';
import { LEVEL_NOTE_LABEL_USERDATA_KEY, LEVEL_NOTE_USERDATA_KEY } from './level_note_keys.js';
import { levelNoteColorOf } from './level_note_color.js';

/** Canvas pixels per CSS pixel, for crisp text on dense screens. */
const LABEL_SCALE = 2;
/** Widest label, in CSS pixels. */
const LABEL_WIDTH_MAX = 260;
/** Body lines shown before the text is cut. */
const LABEL_LINES_MAX = 4;
/** Line height, in CSS pixels. */
const LABEL_LINE = 16;
/** Inner padding, in CSS pixels. */
const LABEL_PAD = 7;
/** Gap between the pin head and the label, in CSS pixels. */
const LABEL_LIFT = 6;
const LABEL_TITLE_FONT = `600 ${13 * LABEL_SCALE}px system-ui, sans-serif`;
const LABEL_BODY_FONT = `${12 * LABEL_SCALE}px system-ui, sans-serif`;

const labelAnchor = new THREE.Vector3();
const labelUp = new THREE.Vector3();
const labelQuaternion = new THREE.Quaternion();
const labelScale = new THREE.Vector3();

/** Label content: the note name as its title and the wrapped body lines. */
interface LevelNoteLabelContent {
  title: string;
  lines: string[];
  color: number;
}

/**
 * Adds the screen-sized label child to a note marker. It always faces the view,
 * keeps its size on screen in every pane, stays readable through walls, cannot
 * be picked, and redraws itself when the name, text or color changes.
 *
 * @param marker Note marker mesh.
 */
export function levelNoteLabelAdd(marker: THREE.Mesh): void {
  const canvas = document.createElement('canvas');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.userData[LEVEL_NOTE_LABEL_USERDATA_KEY] = true;
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 999;
  sprite.frustumCulled = false;
  sprite.matrixAutoUpdate = false;
  sprite.matrixWorldAutoUpdate = false;
  sprite.raycast = () => undefined;
  let drawn = '';
  let aspect = 1;
  let height = 1;
  sprite.onBeforeRender = (renderer, _scene, camera) => {
    const content = levelNoteLabelContent(marker);
    const key = JSON.stringify(content);
    if (key !== drawn) {
      drawn = key;
      [aspect, height] = levelNoteLabelDraw(canvas, content);
      texture.dispose();
      texture.needsUpdate = true;
    }
    levelNoteLabelPlace(sprite, marker, renderer, camera, aspect, height);
  };
  marker.add(sprite);
}

/**
 * Returns the label child of a note marker.
 *
 * @param marker Note marker.
 * @returns Label sprite, or null.
 */
export function levelNoteLabelOf(marker: THREE.Object3D): THREE.Sprite | null {
  const found = marker.children.find((child) => child.userData[LEVEL_NOTE_LABEL_USERDATA_KEY] === true);
  return found instanceof THREE.Sprite ? found : null;
}

/**
 * Reads what the label of a marker shows.
 *
 * @param marker Note marker.
 * @returns Title, wrapped body lines and accent color.
 */
function levelNoteLabelContent(marker: THREE.Mesh): LevelNoteLabelContent {
  const stored = marker.userData[LEVEL_NOTE_USERDATA_KEY] as { text?: unknown } | undefined;
  const text = typeof stored?.text === 'string' ? stored.text : '';
  return {
    title: marker.name.length > 0 ? marker.name : 'Note',
    lines: levelNoteLabelBody(text),
    color: levelNoteColorOf(marker),
  };
}

/**
 * Splits note text into the lines the label shows, cutting long lines by
 * character count so the layout does not depend on the font.
 *
 * @param text Note text.
 * @returns At most {@link LABEL_LINES_MAX} lines, the last one marked when cut.
 */
export function levelNoteLabelBody(text: string): string[] {
  const width = 36;
  const lines: string[] = [];
  for (const paragraph of text.trim().split('\n')) {
    let rest = paragraph.trim();
    if (rest.length === 0 && lines.length > 0) continue;
    while (rest.length > width) {
      const space = rest.lastIndexOf(' ', width);
      const cut = space > width / 2 ? space : width;
      lines.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest.length > 0) lines.push(rest);
  }
  if (lines.length <= LABEL_LINES_MAX) return lines;
  const shown = lines.slice(0, LABEL_LINES_MAX);
  shown[LABEL_LINES_MAX - 1] = `${shown[LABEL_LINES_MAX - 1]!.replace(/.{0,2}$/, '')}…`;
  return shown;
}

/**
 * Draws the label card: a dark rounded card with an accent bar in the marker
 * color, the note name and its first lines of text.
 *
 * @param canvas Target canvas.
 * @param content What to show.
 * @returns Width over height, and the height in CSS pixels.
 */
function levelNoteLabelDraw(canvas: HTMLCanvasElement, content: LevelNoteLabelContent): [number, number] {
  const cssHeight = LABEL_PAD * 2 + LABEL_LINE * (1 + content.lines.length);
  const context = canvas.getContext('2d');
  const widest = context === null ? 120 : levelNoteLabelMeasure(context, content);
  const cssWidth = Math.min(LABEL_WIDTH_MAX, Math.max(60, Math.ceil(widest) + LABEL_PAD * 2 + 4));
  canvas.width = cssWidth * LABEL_SCALE;
  canvas.height = cssHeight * LABEL_SCALE;
  if (context === null) return [cssWidth / cssHeight, cssHeight];
  const s = LABEL_SCALE;
  context.fillStyle = 'rgba(17, 24, 39, 0.9)';
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 6 * s);
  context.fill();
  const accent = `#${content.color.toString(16).padStart(6, '0')}`;
  context.fillStyle = accent;
  context.fillRect(0, 0, 4 * s, canvas.height);
  context.textBaseline = 'middle';
  context.font = LABEL_TITLE_FONT;
  context.fillStyle = '#f8fafc';
  levelNoteLabelText(context, content.title, LABEL_PAD + 4, LABEL_PAD + LABEL_LINE / 2, cssWidth);
  context.font = LABEL_BODY_FONT;
  context.fillStyle = '#cbd5e1';
  content.lines.forEach((line, index) => {
    const y = LABEL_PAD + LABEL_LINE * (index + 1.5);
    levelNoteLabelText(context, line, LABEL_PAD + 4, y, cssWidth);
  });
  return [cssWidth / cssHeight, cssHeight];
}

/**
 * Writes one line, clipped to the card.
 *
 * @param context Canvas context.
 * @param text Line text.
 * @param x Left edge in CSS pixels.
 * @param y Middle in CSS pixels.
 * @param width Card width in CSS pixels.
 */
function levelNoteLabelText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
): void {
  context.fillText(text, x * LABEL_SCALE, y * LABEL_SCALE, (width - x - LABEL_PAD) * LABEL_SCALE);
}

/**
 * Measures the widest label line in CSS pixels.
 *
 * @param context Canvas context.
 * @param content Label content.
 * @returns Width in CSS pixels.
 */
function levelNoteLabelMeasure(context: CanvasRenderingContext2D, content: LevelNoteLabelContent): number {
  context.font = LABEL_TITLE_FONT;
  let widest = context.measureText(content.title).width;
  context.font = LABEL_BODY_FONT;
  for (const line of content.lines) widest = Math.max(widest, context.measureText(line).width);
  return widest / LABEL_SCALE;
}

/**
 * Places the label above the pin head at a constant screen size for the pane
 * being drawn.
 *
 * @param sprite Label sprite.
 * @param marker Note marker.
 * @param renderer Renderer.
 * @param camera Pane camera.
 * @param aspect Label width over height.
 * @param cssHeight Label height in CSS pixels.
 */
function levelNoteLabelPlace(
  sprite: THREE.Sprite,
  marker: THREE.Mesh,
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  aspect: number,
  cssHeight: number,
): void {
  marker.geometry.boundingBox ?? marker.geometry.computeBoundingBox();
  const top = marker.geometry.boundingBox?.max.y ?? 0;
  labelAnchor.set(0, top, 0).applyMatrix4(marker.matrixWorld);
  const perPixel = levelNoteWorldPerPixel(renderer, camera, labelAnchor);
  labelUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  labelAnchor.addScaledVector(labelUp, LABEL_LIFT * perPixel);
  const height = cssHeight * perPixel;
  labelScale.set(height * aspect, height, 1);
  sprite.matrixWorld.compose(labelAnchor, labelQuaternion, labelScale);
}
