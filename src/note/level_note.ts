import * as THREE from 'three';
import { SKIP_FACE_PICK_USERDATA_KEY } from '@/solid/model/solid_brush_visual.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { levelNoteLabelAdd } from './level_note_label.js';
import { LEVEL_NOTE_USERDATA_KEY } from './level_note_keys.js';
import { LEVEL_NOTE_DEFAULT_COLOR, levelNoteColorOf } from './level_note_color.js';

export { LEVEL_NOTE_DEFAULT_COLOR };

/** Longest note text kept, in characters. */
export const LEVEL_NOTE_TEXT_MAX = 4000;

/** What a level note stores besides its transform, name and color. */
export interface LevelNoteData {
  /** Free note text; may span several lines. */
  text: string;
}

/**
 * A level note: a pin marker placed in the level that carries free text for the
 * people building it. It is an ordinary scene mesh (so it selects, moves,
 * locks, hides, copies, saves and syncs like one) that is never exported to a
 * game and never edited as geometry. Its color is the marker material color.
 */
export class LevelNote {
  /**
   * Returns whether an object is a level note marker.
   *
   * @param object Scene object.
   * @returns True for notes.
   */
  static is(object: THREE.Object3D): boolean {
    return object instanceof THREE.Mesh && LevelNote.stored(object) !== null;
  }

  /**
   * Reads the note of a marker.
   *
   * @param object Note marker.
   * @returns Note data; empty text for anything else.
   */
  static read(object: THREE.Object3D): LevelNoteData {
    return { text: LevelNote.stored(object)?.text ?? '' };
  }

  /**
   * Stores normalized note data on a marker.
   *
   * @param object Note marker.
   * @param data New note data.
   */
  static write(object: THREE.Object3D, data: LevelNoteData): void {
    object.userData[LEVEL_NOTE_USERDATA_KEY] = LevelNote.normalize(data);
  }

  /**
   * Normalizes untrusted note data from a file, the network or the user.
   *
   * @param data Candidate data.
   * @returns Clean data.
   */
  static normalize(data: unknown): LevelNoteData {
    const text = (data as { text?: unknown } | null)?.text;
    return { text: typeof text === 'string' ? text.replace(/\r\n?/g, '\n').slice(0, LEVEL_NOTE_TEXT_MAX) : '' };
  }

  /**
   * Returns the marker color.
   *
   * @param object Note marker.
   * @returns Color as 0xRRGGBB.
   */
  static color(object: THREE.Object3D): number {
    return levelNoteColorOf(object);
  }

  /**
   * Creates an unnamed note marker with its pin shape and screen label.
   *
   * @param data Note data.
   * @param color Marker color.
   * @returns Note mesh; its origin is the pin tip.
   */
  static create(data: LevelNoteData, color = LEVEL_NOTE_DEFAULT_COLOR): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 });
    const mesh = new THREE.Mesh(levelNotePinGeometry(), material);
    mesh.userData[SKIP_FACE_PICK_USERDATA_KEY] = true;
    LevelNote.write(mesh, data);
    levelNoteLabelAdd(mesh);
    return mesh;
  }

  /**
   * Creates a named note for the Add menu.
   *
   * @returns New note mesh.
   */
  static createNamed(): THREE.Mesh {
    const mesh = LevelNote.create({ text: '' });
    mesh.name = hierarchyNameAllocator.allocate('Note');
    return mesh;
  }

  /**
   * Returns the stored payload, or null when the object is no note.
   *
   * @param object Scene object.
   * @returns Stored payload.
   */
  private static stored(object: THREE.Object3D): LevelNoteData | null {
    const value: unknown = object.userData[LEVEL_NOTE_USERDATA_KEY];
    return typeof value === 'object' && value !== null ? (value as LevelNoteData) : null;
  }
}

/** Height of the pin from tip to top, in world units. */
export const LEVEL_NOTE_PIN_HEIGHT = 0.5;

/**
 * Builds the pin: a round head on a tapered stem whose tip sits at the origin,
 * so the note marks the exact point it stands on.
 *
 * @returns Pin geometry.
 */
function levelNotePinGeometry(): THREE.BufferGeometry {
  const head = 0.12;
  const center = LEVEL_NOTE_PIN_HEIGHT - head;
  const profile: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let step = 0; step <= 10; step++) {
    const angle = -Math.PI / 3 + (step / 10) * ((5 * Math.PI) / 6);
    profile.push(new THREE.Vector2(Math.cos(angle) * head, center + Math.sin(angle) * head));
  }
  profile[profile.length - 1]!.x = 0;
  const geometry = new THREE.LatheGeometry(profile, 16);
  geometry.computeVertexNormals();
  return geometry;
}
