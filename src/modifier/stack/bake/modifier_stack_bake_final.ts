/** How many final builds, such as a bake, are running now. */
let modifierStackBakeFinalDepth = 0;

/**
 * Runs a build of the final result, such as a bake into plain solids, so
 * scripts that run inside it can tell it from a live preview.
 *
 * @param build The build.
 * @returns What the build returns.
 */
export function modifierStackBakeFinalRun<T>(build: () => T): T {
  modifierStackBakeFinalDepth += 1;
  try {
    return build();
  } finally {
    modifierStackBakeFinalDepth -= 1;
  }
}

/**
 * Whether a final build is running now.
 *
 * @returns True inside modifierStackBakeFinalRun.
 */
export function modifierStackBakeFinal(): boolean {
  return modifierStackBakeFinalDepth > 0;
}
