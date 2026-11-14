/**
 * Builds a public HTTP URL served under the relay's WebSocket path.
 *
 * @param relayUrl Relay WebSocket URL, e.g. `wss://host/ws`.
 * @param segment Path segment after the WebSocket path, e.g. `transfer`.
 * @param id Last path segment, e.g. a link id or token.
 * @returns HTTP URL `https://host/ws/<segment>/<id>`.
 */
export function configCollaborationHttpUrl(relayUrl: string, segment: string, id: string): string {
  const url = new URL(relayUrl);
  url.protocol = url.protocol === 'ws:' ? 'http:' : 'https:';
  url.search = '';
  url.hash = '';
  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/${segment}/${id}`;
  return url.toString();
}
