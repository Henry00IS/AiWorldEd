import type * as THREE from 'three';

/** A WebGL renderer the Debug Menu reports on. */
export interface ImageManagerRenderer {
  label: string;
  renderer: THREE.WebGLRenderer;
}

const imageManagerRenderers = new Set<ImageManagerRenderer>();

/**
 * Registers a WebGL renderer (each has its own context, so its own copy of
 * every texture it draws).
 *
 * @param label Readable name (main window, detached window…).
 * @param renderer Renderer.
 * @returns Unregisters it (when the renderer is disposed).
 */
export function imageManagerRendererAdd(label: string, renderer: THREE.WebGLRenderer): () => void {
  const record = { label, renderer };
  imageManagerRenderers.add(record);
  return () => imageManagerRenderers.delete(record);
}

/**
 * Lists the registered renderers.
 *
 * @returns Renderers, oldest first.
 */
export function imageManagerRendererList(): ImageManagerRenderer[] {
  return [...imageManagerRenderers];
}

/**
 * Returns the number of WebGL contexts textures are uploaded to (at least 1).
 *
 * @returns Count.
 */
export function imageManagerRendererCount(): number {
  return Math.max(1, imageManagerRenderers.size);
}
