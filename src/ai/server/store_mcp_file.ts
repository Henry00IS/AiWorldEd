import type { McpToolResult } from '@/ai/shared/mcp_protocol_types.js';

/** URL path prefix of served files. */
export const STORE_MCP_FILE_PATH = '/transfer/';
/** How long a served file stays available. */
export const STORE_MCP_FILE_LIFETIME_MS = 60 * 60 * 1000;
/** Most files kept at once; the oldest is dropped first. */
export const STORE_MCP_FILE_MAXIMUM = 64;

/** One served file. */
interface StoreMcpFileEntry {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  expiresAt: number;
}

/**
 * Keeps tool result images in memory and serves them as loopback links
 * (`/transfer/<id>`) for the localhost image delivery mode.
 */
export class StoreMcpFile {
  private readonly files: Map<string, StoreMcpFileEntry>;
  private readonly clock: () => number;

  /**
   * Creates an empty store.
   *
   * @param clock Returns the current time (epoch ms).
   */
  constructor(clock: () => number = Date.now) {
    this.files = new Map();
    this.clock = clock;
  }

  /**
   * Moves the `files` of a tool result into the store and lists their links.
   *
   * @param result Tool result from the editor.
   * @param origin Loopback origin, e.g. `http://127.0.0.1:3845`.
   * @returns Result with `links` instead of `files`.
   */
  publish(result: McpToolResult, origin: string): McpToolResult {
    const { files, ...rest } = result;
    if (files === undefined || files.length === 0) return rest;
    const links = files.map((file) => `${origin}${STORE_MCP_FILE_PATH}${this.add(file.data, file.mimeType)}`);
    const text = links.map((link) => `\nImage (PNG, expires in 1 hour): ${link}`).join('');
    return { ...rest, links: [...(rest.links ?? []), ...links], message: `${rest.message}${text}` };
  }

  /**
   * Answers GET and HEAD for a stored file.
   *
   * @param request Incoming request.
   * @returns Response, or null when the path is not a file path.
   */
  serve(request: Request): Response | null {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(STORE_MCP_FILE_PATH)) return null;
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    this.expire();
    const file = this.files.get(path.slice(STORE_MCP_FILE_PATH.length));
    if (file === undefined) return new Response('Not found', { status: 404 });
    const extension = file.mime === 'image/png' ? 'png' : 'jpg';
    const headers = {
      'Content-Type': file.mime,
      'Content-Length': String(file.bytes.byteLength),
      'Content-Disposition': `inline; filename="capture.${extension}"`,
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    };
    return new Response(request.method === 'HEAD' ? null : file.bytes, { headers });
  }

  /** Forgets every file. */
  clear(): void {
    this.files.clear();
  }

  /**
   * Stores one base64 file under a new random id.
   *
   * @param base64 File bytes as base64.
   * @param mime MIME type.
   * @returns Id.
   */
  private add(base64: string, mime: string): string {
    this.expire();
    const oldest = this.files.keys().next();
    if (this.files.size >= STORE_MCP_FILE_MAXIMUM && !oldest.done) this.files.delete(oldest.value);
    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
    this.files.set(id, { bytes, mime, expiresAt: this.clock() + STORE_MCP_FILE_LIFETIME_MS });
    return id;
  }

  /** Drops expired files. */
  private expire(): void {
    const now = this.clock();
    for (const [id, file] of this.files) if (file.expiresAt <= now) this.files.delete(id);
  }
}
