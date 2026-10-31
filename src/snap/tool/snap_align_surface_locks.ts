import type { TextureLockFlags } from '@/texture/lock/texture_lock_transform.js';

/**
 * Locks that leave brush face UV matrices unchanged. Align tools only rotate or
 * slide, so the painted surfaces move with the brush.
 */
export const ALIGN_SURFACE_LOCKS: TextureLockFlags = { positionLock: true, stretchLock: true };
