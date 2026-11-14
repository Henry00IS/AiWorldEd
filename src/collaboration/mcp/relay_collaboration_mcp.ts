import type { SocketCollaborationClient } from '@/collaboration/net/socket_collaboration_client.js';
import type { SocketCollaborationMessage } from '@/collaboration/net/socket_collaboration_types.js';
import type { McpRelayAnswer } from '@/ai/client/relay/link_mcp_relay.js';
import { configCollaborationHttpUrl } from '@/collaboration/config/config_collaboration_http_url.js';
import { MCP_PATH_SEGMENT, MCP_TOKEN_PATTERN } from '@/collaboration/shared/protocol_definitions.js';

/** Token and answer function of the active listen. */
interface RelayCollaborationMcpListen {
  token: string;
  answer: McpRelayAnswer;
}

/** Shown when Start is pressed after a manual Disconnect. */
export const RELAY_COLLABORATION_MCP_OFFLINE = 'Connect to the online server first (Collaborate \u2192 Connect)';
/** Shown when the relay does not announce the `mcp` capability. */
export const RELAY_COLLABORATION_MCP_UNSUPPORTED = 'The online server does not support MCP yet';
/** Largest relay request id. */
const RELAY_COLLABORATION_MCP_QUERY_MAXIMUM = 0xffffffff;

/**
 * Accepts browser MCP on one token over the relay connection: listens with
 * `mcp.listen`, listens again after every reconnect and answers `mcp.request`
 * messages with `mcp.response`.
 */
export class RelayCollaborationMcp {
  private listen: RelayCollaborationMcpListen | null = null;
  private listenedOn: SocketCollaborationClient | null = null;
  private readonly encoder = new TextEncoder();

  /**
   * Creates a component bound to a runtime's connection.
   *
   * @param client Returns the current connection, or null.
   * @param connect Opens the connection when needed.
   * @param online Returns whether the runtime stays online.
   * @param relayUrl Returns the configured relay WebSocket URL.
   */
  constructor(
    private readonly client: () => SocketCollaborationClient | null,
    private readonly connect: () => Promise<void>,
    private readonly online: () => boolean,
    private readonly relayUrl: () => string,
  ) {}

  /**
   * Returns the public MCP URL of a token on the configured relay.
   *
   * @param token MCP token.
   * @returns URL `https://host/<prefix>/mcp/<token>`.
   */
  url(token: string): string {
    return configCollaborationHttpUrl(this.relayUrl(), MCP_PATH_SEGMENT, token);
  }

  /**
   * Starts accepting MCP on a token; rejects with a user-facing error.
   *
   * @param token 64 character base64url token.
   * @param answer Answers forwarded requests.
   * @returns Resolves once the relay confirmed with `mcp.listening`.
   */
  async listenStart(token: string, answer: McpRelayAnswer): Promise<void> {
    if (!MCP_TOKEN_PATTERN.test(token)) throw new Error('Invalid MCP token');
    if (!this.online()) throw new Error(RELAY_COLLABORATION_MCP_OFFLINE);
    await this.connect();
    const client = this.clientOpen();
    if (!client.caps.has('mcp')) throw new Error(RELAY_COLLABORATION_MCP_UNSUPPORTED);
    this.listenStop();
    await client.request({ t: 'mcp.listen', token });
    this.listen = { token, answer };
    this.listenedOn = client;
  }

  /** Stops accepting MCP; does nothing when not listening. */
  listenStop(): void {
    const client = this.listenedOn;
    this.listen = null;
    this.listenedOn = null;
    if (client !== null && client.isOpen()) client.send({ t: 'mcp.unlisten' });
  }

  /**
   * Returns whether MCP is accepted (or accepted again after a reconnect).
   *
   * @returns True between listenStart() and listenStop().
   */
  listening(): boolean {
    return this.listen !== null;
  }

  /** Listens again on a new connection after a reconnect. */
  connected(): void {
    const listen = this.listen;
    const client = this.client();
    if (listen === null || client === null || client === this.listenedOn || !client.isOpen()) return;
    this.listenedOn = client;
    if (!client.caps.has('mcp')) return this.listenLost(RELAY_COLLABORATION_MCP_UNSUPPORTED);
    client.request({ t: 'mcp.listen', token: listen.token }).catch((error: unknown) => {
      if (this.listenedOn === client) this.listenLost(error instanceof Error ? error.message : String(error));
    });
  }

  /**
   * Handles `mcp.request` messages.
   *
   * @param message Relay message.
   * @returns True when the message was an MCP request.
   */
  handle(message: SocketCollaborationMessage): boolean {
    if (message.t !== 'mcp.request') return false;
    const client = this.client();
    const listen = this.listen;
    if (listen === null || client === null || client !== this.listenedOn) return true;
    const q = message['q'];
    const body = message['body'];
    if (!relayCollaborationMcpQueryValid(q) || typeof body !== 'string') return true;
    void this.answerSend(client, listen, q, body);
    return true;
  }

  /**
   * Answers one request and sends the response while the connection lasts.
   *
   * @param client Connection the request came from.
   * @param listen Active listen.
   * @param q Relay request id.
   * @param body Raw JSON-RPC request text.
   */
  private async answerSend(
    client: SocketCollaborationClient,
    listen: RelayCollaborationMcpListen,
    q: number,
    body: string,
  ): Promise<void> {
    const response = await listen.answer(body, (text) => this.responseFits(client, q, text));
    if (client.isOpen() && this.listenedOn === client) client.send({ t: 'mcp.response', q, body: response });
  }

  /**
   * Returns whether an `mcp.response` with this body fits the relay's message
   * limit.
   *
   * @param client Connection.
   * @param q Relay request id.
   * @param response Response text.
   * @returns True when it fits.
   */
  private responseFits(client: SocketCollaborationClient, q: number, response: string): boolean {
    const envelope = JSON.stringify({ t: 'mcp.response', q, body: response });
    return this.encoder.encode(envelope).byteLength <= client.limits.maxPayloadBytes;
  }

  /**
   * Gives up listening after the relay refused a new listen.
   *
   * @param reason Why the listen ended.
   */
  private listenLost(reason: string): void {
    this.listen = null;
    this.listenedOn = null;
    console.warn(`[AiWorldEd] Browser MCP stopped: ${reason}`);
  }

  /**
   * Returns the open connection.
   *
   * @returns Connection; throws when there is none.
   */
  private clientOpen(): SocketCollaborationClient {
    const client = this.client();
    if (client === null || !client.isOpen()) throw new Error('Not connected to the online server');
    return client;
  }
}

/**
 * Returns whether a relay request id is a u32.
 *
 * @param q Untrusted value.
 * @returns True for an integer in 0..2^32-1.
 */
function relayCollaborationMcpQueryValid(q: unknown): q is number {
  return typeof q === 'number' && Number.isInteger(q) && q >= 0 && q <= RELAY_COLLABORATION_MCP_QUERY_MAXIMUM;
}
