import { describe, expect, it } from 'vitest';
import { SocketCollaborationClosedError } from '@/collaboration/net/socket_collaboration_closed_error.js';
import {
  RUNTIME_COLLABORATION_REFUSAL_CODES,
  runtimeCollaborationClosedErrorText,
  runtimeCollaborationCloseText,
  runtimeCollaborationRefusalIs,
} from '@/collaboration/runtime/runtime_collaboration_close_text.js';
import {
  RUNTIME_COLLABORATION_RECONNECT_CODES,
  runtimeCollaborationErrorText,
} from '@/collaboration/runtime/runtime_collaboration_errors.js';
import { CLOSE_CODES } from '@/collaboration/shared/protocol_definitions.js';

/** Explanations of relay close codes, refusals and unreachable relays. */
describe('runtime_collaboration_close_text', () => {
  const editorOrigin = 'https://editor.example.test';
  const relayUrl = 'wss://relay.example.test:8443';

  it('explains each refusal code instead of showing the number', () => {
    expect(runtimeCollaborationCloseText(CLOSE_CODES.originRefused, editorOrigin)).toBe(
      `This relay doesn't allow editors from ${editorOrigin}. Ask its admin to add it to ALLOWED_ORIGINS.`,
    );
    expect(runtimeCollaborationCloseText(CLOSE_CODES.proxyRefused, editorOrigin)).toContain('FORWARDED_SECRET');
    expect(runtimeCollaborationCloseText(CLOSE_CODES.tooManyConnections, editorOrigin)).toContain(
      'too many connections',
    );
    expect(runtimeCollaborationCloseText(CLOSE_CODES.serverFull, editorOrigin)).toContain('full');
  });

  it('names the relay URL when the socket never opened', () => {
    const unreachable = new SocketCollaborationClosedError(1006, '', relayUrl, false);
    expect(runtimeCollaborationClosedErrorText(unreachable, editorOrigin)).toContain(
      `Cannot reach the relay at ${relayUrl}`,
    );
    expect(runtimeCollaborationClosedErrorText(unreachable, editorOrigin)).toContain('certificate');
    expect(runtimeCollaborationErrorText(unreachable)).toContain(relayUrl);
  });

  it('treats a drop after opening as a lost connection, not an unreachable relay', () => {
    const dropped = new SocketCollaborationClosedError(1006, '', relayUrl, true);
    expect(runtimeCollaborationClosedErrorText(dropped, editorOrigin)).not.toContain('Cannot reach');
  });

  it('never reconnects after a refusal', () => {
    for (const refusalCode of RUNTIME_COLLABORATION_REFUSAL_CODES) {
      expect(RUNTIME_COLLABORATION_RECONNECT_CODES.has(refusalCode)).toBe(false);
      expect(runtimeCollaborationRefusalIs(new SocketCollaborationClosedError(refusalCode, '', relayUrl, true))).toBe(
        true,
      );
    }
    expect(runtimeCollaborationRefusalIs(new SocketCollaborationClosedError(1006, '', relayUrl, false))).toBe(false);
    expect(runtimeCollaborationRefusalIs(new Error('closed 4009'))).toBe(false);
  });
});
