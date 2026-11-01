/**
 * Decides whether this editor may load textures from its own disk. A
 * collaboration room member uses the room owner's textures, so opening a local
 * folder is refused while it is in a room.
 */
export type TextureSourceGate = () => string | null;

let activeGate: TextureSourceGate | null = null;

/**
 * Installs the gate, or removes it with null.
 *
 * @param gate Returns why local folders are refused, or null when allowed.
 */
export function textureSourceGateSet(gate: TextureSourceGate | null): void {
  activeGate = gate;
}

/**
 * Returns why opening a local texture folder is refused right now.
 *
 * @returns Reason shown to the user, or null when allowed.
 */
export function textureSourceBlocked(): string | null {
  return activeGate?.() ?? null;
}
