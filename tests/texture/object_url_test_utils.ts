import { vi } from 'vitest';

/**
 * Ensures URL.createObjectURL / revokeObjectURL exist so vi.spyOn can wrap them.
 * jsdom often omits these APIs.
 */
export function ensureObjectUrlApis(): void {
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: () => 'blob:missing'
    });
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => undefined
    });
  }
}

/**
 * Installs sequential blob: URLs for createObjectURL and a no-op revoke.
 * @param prefix Prefix for generated blob URLs.
 * @returns Spy handles for assertions.
 */
export function mockObjectUrlApis(prefix: string = 'blob:test') {
  ensureObjectUrlApis();
  let counter = 0;
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation((blob) => {
      const name = blob instanceof File ? blob.name : String(counter);
      return `${prefix}-${counter++}-${name}`;
    });
  const revokeObjectURL = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => undefined);
  return { createObjectURL, revokeObjectURL };
}
