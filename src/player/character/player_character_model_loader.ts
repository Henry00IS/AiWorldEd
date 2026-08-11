import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { playerCharacterModelUrl } from './player_character_model_url.js';
import { playerCharacterPrepareModelScene } from './player_character_model_prepare.js';

let preparedTemplate: THREE.Group | null = null;
let loadPromise: Promise<THREE.Group> | null = null;

/**
 * Returns whether a prepared character template is ready for cloning.
 *
 * @returns True when buildRig can run synchronously.
 */
export function playerCharacterIsModelReady(): boolean {
  return preparedTemplate !== null;
}

/**
 * Ensures the bundled character model is loaded and prepared.
 *
 * @param modelUrl Optional override URL for tests.
 * @returns Promise resolving to the prepared template group.
 */
export function playerCharacterEnsureModelLoaded(modelUrl?: string): Promise<THREE.Group> {
  if (preparedTemplate) {
    return Promise.resolve(preparedTemplate);
  }
  if (loadPromise) {
    return loadPromise;
  }
  const url = modelUrl ?? playerCharacterModelUrl();
  loadPromise = loadModelFromUrl(url)
    .then((template) => {
      preparedTemplate = template;
      return template;
    })
    .catch((error: unknown) => {
      loadPromise = null;
      throw error;
    });
  return loadPromise;
}

/**
 * Loads and prepares a character model from a raw ArrayBuffer or byte view.
 *
 * @param buffer Binary glTF buffer or typed view over one.
 * @returns Promise resolving when the template is ready.
 */
export async function playerCharacterLoadModelFromArrayBuffer(buffer: ArrayBuffer | ArrayBufferView): Promise<void> {
  const scene = await parseGlbArrayBuffer(copyToRealmArrayBuffer(buffer));
  preparedTemplate = playerCharacterPrepareModelScene(scene);
  loadPromise = Promise.resolve(preparedTemplate);
}

/**
 * Returns the prepared template when available.
 *
 * @returns Prepared template group, or null.
 */
export function playerCharacterGetPreparedTemplate(): THREE.Group | null {
  return preparedTemplate;
}

/** Clears the cached template so the next ensure call reloads. */
export function playerCharacterResetModelLoader(): void {
  preparedTemplate = null;
  loadPromise = null;
}

/**
 * Fetches and prepares a model from a URL.
 *
 * @param url Model asset URL.
 * @returns Prepared template group.
 */
async function loadModelFromUrl(url: string): Promise<THREE.Group> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load character model: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const scene = await parseGlbArrayBuffer(copyToRealmArrayBuffer(buffer));
  return playerCharacterPrepareModelScene(scene);
}

/**
 * Parses a GLB ArrayBuffer into a Three.js scene graph.
 *
 * @param buffer Binary glTF buffer in the current JS realm.
 * @returns Parsed scene root.
 */
function parseGlbArrayBuffer(buffer: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(
      buffer,
      '',
      (gltf) => {
        resolve(gltf.scene);
      },
      (error) => {
        reject(error);
      },
    );
  });
}

/**
 * Copies bytes into a new ArrayBuffer in the current realm for GLTFLoader
 * checks.
 *
 * @param source Source buffer or typed array view.
 * @returns Fresh ArrayBuffer containing the same bytes.
 */
function copyToRealmArrayBuffer(source: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const bytes =
    source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
