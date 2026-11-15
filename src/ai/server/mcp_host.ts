import { MCP_BIND_HOST, MCP_HTTP_PATH } from '@/ai/shared/mcp_constants.js';
import type { McpHostStartResult, McpHostStatus } from '@/ai/shared/mcp_protocol_types.js';
import { handleMcpHttpRequest } from './handler_mcp_http.js';
import { createMcpSessionState, listMcpPortCandidates, type SessionMcpState } from './session_mcp.js';
import type { McpEditorEndpoint } from './mcp_editor_endpoint.js';
import { StoreMcpFile } from './store_mcp_file.js';

/** Minimal server surface used so tests can mock without Bun.serve types. */
export interface McpHttpServer {
  stop: (closeActiveConnections?: boolean) => void;
  /** Bound port when known (Bun.serve may expose number | undefined). */
  port?: number | undefined;
}

/** Factory that binds a loopback HTTP server for MCP. */
export type McpServerFactory = (port: number, fetchHandler: (request: Request) => Promise<Response>) => McpHttpServer;

/**
 * Hosts the local MCP Streamable HTTP endpoint inside the Electrobun Bun
 * process. Loopback only; no auth token (URL is enough for local use).
 */
export class McpHost {
  private server: McpHttpServer | null;
  private session: SessionMcpState | null;
  private endpoint: McpEditorEndpoint | null;
  private readonly serverFactory: McpServerFactory;
  private readonly files: StoreMcpFile;

  /**
   * Creates an MCP host.
   *
   * @param serverFactory Optional server factory (defaults to Bun.serve).
   */
  constructor(serverFactory: McpServerFactory = defaultBunServerFactory) {
    this.server = null;
    this.session = null;
    this.endpoint = null;
    this.serverFactory = serverFactory;
    this.files = new StoreMcpFile();
  }

  /**
   * Starts the MCP server on the first free loopback port.
   *
   * @param endpoint Editor that lists and runs the tools in the webview.
   * @returns Start result with URL.
   */
  start(endpoint: McpEditorEndpoint): McpHostStartResult {
    if (this.server && this.session) {
      return {
        ok: true,
        message: 'MCP server already running',
        status: this.getStatus(),
      };
    }
    this.endpoint = endpoint;
    for (const port of listMcpPortCandidates()) {
      const started = this.tryBindPort(port);
      if (started) return started;
    }
    this.endpoint = null;
    return {
      ok: false,
      message: 'Could not bind a local MCP port',
      status: this.getStatus(),
    };
  }

  /**
   * Stops the MCP HTTP server if running.
   *
   * @returns Updated host status.
   */
  stop(): McpHostStatus {
    if (this.server) {
      try {
        this.server.stop(true);
      } catch {
        // Ignore stop errors when the process is already tearing down.
      }
    }
    this.server = null;
    this.session = null;
    this.endpoint = null;
    this.files.clear();
    return this.getStatus();
  }

  /**
   * Returns the current MCP host status for the UI.
   *
   * @returns Host status snapshot.
   */
  getStatus(): McpHostStatus {
    if (!this.server || !this.session) {
      return { running: false, port: null, url: null };
    }
    return {
      running: true,
      port: this.session.port,
      url: buildMcpUrl(this.session.port),
    };
  }

  /**
   * Attempts to bind one loopback port.
   *
   * @param port Candidate port.
   * @returns Start result when successful, otherwise null.
   */
  private tryBindPort(port: number): McpHostStartResult | null {
    const session = createMcpSessionState(port);
    try {
      const server = this.serverFactory(port, (request) => this.handleRequest(request));
      this.server = server;
      this.session = session;
      return {
        ok: true,
        message: `MCP server listening on ${buildMcpUrl(port)}`,
        status: this.getStatus(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Dispatches an HTTP request for the bound host: served capture files, else
   * MCP. Images a tool returns as `files` become loopback links.
   *
   * @param request Incoming request.
   * @returns HTTP response.
   */
  private async handleRequest(request: Request): Promise<Response> {
    const endpoint = this.endpoint;
    const session = this.session;
    if (!endpoint || !session) {
      return new Response(JSON.stringify({ error: 'MCP host not ready' }), { status: 503 });
    }
    const served = this.files.serve(request);
    if (served !== null) return served;
    const origin = `http://${MCP_BIND_HOST}:${session.port}`;
    return handleMcpHttpRequest(request, {
      toolsList: () => endpoint.toolsList(),
      toolCall: async (name, args) => this.files.publish(await endpoint.toolCall(name, args), origin),
    });
  }
}

/**
 * Builds the public MCP endpoint URL for a port.
 *
 * @param port Bound port.
 * @returns Full URL string.
 */
export function buildMcpUrl(port: number): string {
  return `http://${MCP_BIND_HOST}:${port}${MCP_HTTP_PATH}`;
}

/**
 * Default factory using Bun.serve on loopback.
 *
 * @param port Port to bind.
 * @param fetchHandler Request handler.
 * @returns Server handle.
 */
function defaultBunServerFactory(port: number, fetchHandler: (request: Request) => Promise<Response>): McpHttpServer {
  const bunGlobal = globalThis as typeof globalThis & {
    Bun?: {
      serve: (options: {
        hostname: string;
        port: number;
        fetch: (request: Request) => Promise<Response>;
      }) => McpHttpServer;
    };
  };
  if (!bunGlobal.Bun?.serve) {
    throw new Error('Bun.serve is not available');
  }
  return bunGlobal.Bun.serve({
    hostname: MCP_BIND_HOST,
    port,
    fetch: fetchHandler,
  });
}
