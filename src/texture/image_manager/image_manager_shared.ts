import { ManagerImage } from './manager_image.js';
import { imageManagerRendererCount } from './image_manager_renderers.js';

let imageManagerShared: ManagerImage | null = null;

/**
 * Returns the editor's image manager.
 *
 * @returns Shared manager.
 */
export function getImageManager(): ManagerImage {
  imageManagerShared ??= new ManagerImage({
    contexts: () => imageManagerRendererCount(),
    warnLeaks: import.meta.env?.DEV === true,
  });
  return imageManagerShared;
}

/**
 * Replaces the shared manager (tests only).
 *
 * @param manager Manager, or null for a fresh one on next use.
 */
export function setImageManagerForTests(manager: ManagerImage | null): void {
  imageManagerShared = manager;
}
