import { APPLICATION_VERSION } from '@/application_identity.js';

/**
 * Fork authors MUST set this to their editor's stable project home URL (at most
 * 256 characters). Only a denying owner shares it as an untrusted link.
 */
export const COLLABORATION_EDITOR_HOME = 'https://henry00is.github.io/AiWorldEd';
/**
 * Exact compatibility version; change when a fork changes its scene/protocol
 * semantics.
 */
export const COLLABORATION_EDITOR_VERSION = APPLICATION_VERSION;

/** Scene compatibility schema; increment for incompatible scene interpretation. */
export const COLLABORATION_EDITOR_SCHEMA = 3;
/** Capabilities this editor preserves and understands; forks may add their own. */
export const COLLABORATION_EDITOR_CAPS = ['aiworlded.scene.v3'];
/** Capabilities every joiner must implement to join this editor's room. */
export const COLLABORATION_EDITOR_REQUIRED_CAPS = ['aiworlded.scene.v3'];
