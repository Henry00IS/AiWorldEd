import { APPLICATION_VERSION } from '@/application_identity.js';

/**
 * Fork authors MUST set this to their editor's stable project home URL (at most
 * 256 characters). Only a denying owner shares it as an untrusted link.
 */
export const COLLABORATION_EDITOR_HOME = 'https://henry00is.github.io/AiWorldEd';
/** Actual application build version, shared with settings and assigned by CI. */
export const COLLABORATION_EDITOR_VERSION = APPLICATION_VERSION;

/**
 * Exact same-software check; forks change their home constant, not this rule.
 *
 * @param identity Joiner's declared URL and real build version.
 * @returns Whether both strings exactly match this editor.
 */
export function collaborationIdentityMatches(identity: { homeUrl: string; version: string }): boolean {
  return identity.homeUrl === COLLABORATION_EDITOR_HOME && identity.version === COLLABORATION_EDITOR_VERSION;
}
