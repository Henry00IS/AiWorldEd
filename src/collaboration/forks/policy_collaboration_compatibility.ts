import type { CompatibilityDecision, CompatibilityIdentity } from '@/collaboration/shared/compatibility_identity.js';
import {
  COLLABORATION_EDITOR_CAPS,
  COLLABORATION_EDITOR_REQUIRED_CAPS,
  COLLABORATION_EDITOR_SCHEMA,
  COLLABORATION_EDITOR_VERSION,
} from '@/collaboration/forks/identity_collaboration_editor.js';

/** Identity used only locally by this editor; never sent when creating a room. */
const OWNER_IDENTITY: CompatibilityIdentity = {
  version: COLLABORATION_EDITOR_VERSION,
  schema: COLLABORATION_EDITOR_SCHEMA,
  caps: COLLABORATION_EDITOR_CAPS,
};

/**
 * Forks override this single policy function to decide which joiners they
 * trust. The default requires equal scene schema/version and all required
 * capabilities. Forks may explicitly allow compatible versions with different
 * version strings.
 *
 * @param joiner Joiner's bounded identity forwarded unchanged by the relay.
 * @param owner Local identity; injectable for tests, never transmitted.
 * @param requiredCaps Capabilities required from other forks.
 * @returns Owner's authoritative decision and a bounded public reason.
 */
export function collaborationCompatibilityPolicy(
  joiner: CompatibilityIdentity,
  owner = OWNER_IDENTITY,
  requiredCaps: readonly string[] = COLLABORATION_EDITOR_REQUIRED_CAPS,
): CompatibilityDecision {
  if (joiner.schema !== owner.schema) return { allow: false, reason: 'schema_mismatch' };
  if (joiner.version !== owner.version) return { allow: false, reason: 'version_mismatch' };
  if (!requiredCaps.every((cap) => joiner.caps.includes(cap))) return { allow: false, reason: 'missing_caps' };
  return { allow: true };
}
