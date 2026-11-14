/** Membership bit of static level geometry colliders. */
export const PHYSICS_LEVEL_GROUP_LEVEL_BIT = 0x0001;

/** Membership bit of the player character probe collider. */
export const PHYSICS_LEVEL_GROUP_CHARACTER_BIT = 0x0002;

/**
 * Packs Rapier interaction groups from membership and filter bit masks.
 *
 * @param membershipBits Groups the collider or query belongs to.
 * @param filterBits Groups the collider or query interacts with.
 * @returns Packed 32-bit interaction groups.
 */
export function physicsLevelPackInteractionGroups(membershipBits: number, filterBits: number): number {
  return ((membershipBits & 0xffff) << 16) | (filterBits & 0xffff);
}

/** Interaction groups of level geometry colliders: level, hit by everything. */
export const PHYSICS_LEVEL_GROUPS_LEVEL_COLLIDER = physicsLevelPackInteractionGroups(
  PHYSICS_LEVEL_GROUP_LEVEL_BIT,
  0xffff,
);

/** Interaction groups of the character probe collider: only touches level. */
export const PHYSICS_LEVEL_GROUPS_CHARACTER_COLLIDER = physicsLevelPackInteractionGroups(
  PHYSICS_LEVEL_GROUP_CHARACTER_BIT,
  PHYSICS_LEVEL_GROUP_LEVEL_BIT,
);

/** Interaction groups for scene queries that must only see level geometry. */
export const PHYSICS_LEVEL_GROUPS_LEVEL_QUERY = physicsLevelPackInteractionGroups(
  0xffff,
  PHYSICS_LEVEL_GROUP_LEVEL_BIT,
);
