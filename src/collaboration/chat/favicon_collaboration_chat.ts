import {
  COLLABORATION_CHAT_UNREAD_SHOWN,
  collaborationChatUnreadLabel,
} from '@/collaboration/chat/unread_collaboration_chat.js';

/** Backing size of the badged favicon PNG, high enough for crisp tab icons. */
export const FAVICON_COLLABORATION_CHAT_SIZE = 128;
/** Notification badge fill. */
export const FAVICON_COLLABORATION_CHAT_BADGE = '#e53935';
/** Badge numeral and ring. */
export const FAVICON_COLLABORATION_CHAT_BADGE_INK = '#ffffff';

/** Snapshot of one original favicon link, restored when the count drops to 0. */
interface FaviconLinkSnapshot {
  rel: string;
  href: string;
  type: string;
  sizes: string;
}

/** Overrides for tests and environments without a document or canvas. */
export interface FaviconCollaborationChatOptions {
  /** Document whose tab icon is updated; null skips all work. */
  document?: Document | null;
  /**
   * Creates a canvas used to paint the badge.
   *
   * @returns Canvas and 2D context, or null when drawing is unavailable.
   */
  canvas?: () => { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null;
  /**
   * Loads the original favicon as an image.
   *
   * @param href Icon URL.
   * @returns Image, or null when it cannot be drawn.
   */
  loadImage?: (href: string) => Promise<CanvasImageSource | null>;
}

/**
 * Picks the favicon badge label: the status bar text, or "99" when "99+" does
 * not fit in the circle.
 *
 * @param count Unread messages.
 * @param textWidth Width of a label in the current badge font, in pixels.
 * @param maxWidth Widest label that stays inside the badge.
 * @returns Badge text, or an empty string when the count is 0.
 */
export function faviconCollaborationChatBadgeLabel(
  count: number,
  textWidth: (text: string) => number,
  maxWidth: number,
): string {
  const label = collaborationChatUnreadLabel(count);
  if (label !== `${COLLABORATION_CHAT_UNREAD_SHOWN}+`) return label;
  return textWidth(label) <= maxWidth ? label : String(COLLABORATION_CHAT_UNREAD_SHOWN);
}

/**
 * Paints the original icon and a red unread badge onto a 2D context whose
 * canvas is {@link size} pixels on a side (1:1, no extra transform).
 *
 * @param ctx 2D context.
 * @param icon Original favicon, if loaded.
 * @param count Unread messages; 0 draws only the icon.
 * @param size Canvas width and height in pixels.
 */
export function faviconCollaborationChatPaint(
  ctx: CanvasRenderingContext2D,
  icon: CanvasImageSource | null,
  count: number,
  size: number,
): void {
  ctx.clearRect(0, 0, size, size);
  if (icon !== null) ctx.drawImage(icon, 0, 0, size, size);
  if (count <= 0) return;

  const radius = size * (count > COLLABORATION_CHAT_UNREAD_SHOWN ? 0.3 : 0.28);
  const inset = Math.max(2, size * 0.03);
  const cy = size - inset - radius;
  const fontSize = badgeFontSize(count, size);
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textWidth = (text: string) => ctx.measureText(text).width;
  const label = faviconCollaborationChatBadgeLabel(count, textWidth, radius * 1.7);
  const textW = textWidth(label);
  const circleFits = textW <= radius * 1.7;
  const width = circleFits ? radius * 2 : Math.min(size - inset * 2, Math.max(radius * 2, textW + fontSize * 0.7));
  const cx = size - inset - width / 2;

  ctx.fillStyle = FAVICON_COLLABORATION_CHAT_BADGE;
  ctx.strokeStyle = FAVICON_COLLABORATION_CHAT_BADGE_INK;
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.beginPath();
  if (circleFits && typeof ctx.arc === 'function') {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  } else if (typeof ctx.roundRect === 'function') {
    const height = radius * 2;
    ctx.roundRect(cx - width / 2, cy - height / 2, width, height, radius);
  } else {
    ctx.arc(cx, cy, Math.max(radius, width / 2), 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = FAVICON_COLLABORATION_CHAT_BADGE_INK;
  ctx.fillText(label, cx, cy + size * 0.01);
}

/**
 * Tab favicon badge for the unread room-chat count. Draws the number on a
 * high-resolution canvas over the original favicon and swaps the document icon
 * links. When the count is 0, or drawing is unavailable (no document, no
 * canvas, desktop shells without a tab icon), the original favicon is left
 * alone or restored.
 */
export class FaviconCollaborationChat {
  private readonly document: Document | null;
  private readonly canvas: () => { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null;
  private readonly loadImage: (href: string) => Promise<CanvasImageSource | null>;
  private original: FaviconLinkSnapshot[] | null;
  private sourceHref: string | null;
  private image: CanvasImageSource | null | undefined;
  private loading: Promise<void> | null;
  private count: number;
  private disposed: boolean;

  /** @param options Test and environment overrides. */
  constructor(options: FaviconCollaborationChatOptions = {}) {
    this.document =
      options.document === undefined ? (typeof document === 'undefined' ? null : document) : options.document;
    this.canvas = options.canvas ?? defaultCanvas;
    this.loadImage = options.loadImage ?? defaultLoadImage;
    this.original = null;
    this.sourceHref = null;
    this.image = undefined;
    this.loading = null;
    this.count = 0;
    this.disposed = false;
  }

  /**
   * Shows the unread count on the tab icon, or restores the original favicon
   * when the count is 0.
   *
   * @param count Unread messages.
   */
  unreadSet(count: number): void {
    if (this.disposed) return;
    this.count = count;
    if (count <= 0) {
      this.restore();
      return;
    }
    if (this.document === null || this.canvas() === null) return;
    if (this.image !== undefined) {
      this.apply();
      return;
    }
    void this.ensureImage().then(() => {
      if (!this.disposed && this.count > 0) this.apply();
    });
  }

  /** Restores the original favicon links, if they were replaced. */
  dispose(): void {
    this.disposed = true;
    this.restore();
  }

  /** Loads the original favicon once, allowing a missing image. */
  private async ensureImage(): Promise<void> {
    if (this.loading) {
      await this.loading;
      return;
    }
    const href = this.sourceHref ?? this.captureSource();
    this.loading = (async () => {
      this.image = href === null ? null : await this.loadImage(href);
    })();
    await this.loading;
  }

  /**
   * Remembers the document's current favicon links and their preferred href.
   *
   * @returns Href to paint under the badge, or null.
   */
  private captureSource(): string | null {
    const page = this.document;
    if (page === null) return null;
    if (this.original === null) this.original = snapshotFaviconLinks(page);
    if (this.sourceHref === null) this.sourceHref = preferredFaviconHref(this.original);
    return this.sourceHref;
  }

  /** Paints the current count and replaces the document icon links. */
  private apply(): void {
    const page = this.document;
    if (page === null || this.count <= 0) return;
    const surface = this.canvas();
    if (surface === null) return;
    this.captureSource();
    const size = FAVICON_COLLABORATION_CHAT_SIZE;
    surface.canvas.width = size;
    surface.canvas.height = size;
    try {
      faviconCollaborationChatPaint(surface.ctx, this.image ?? null, this.count, size);
      const href = surface.canvas.toDataURL('image/png');
      if (!href.startsWith('data:')) return;
      replaceFaviconLinks(page, href);
    } catch {
      // A tainted canvas or a missing toDataURL leaves the original icon.
    }
  }

  /** Puts the remembered favicon links back. */
  private restore(): void {
    const page = this.document;
    if (page === null || this.original === null) return;
    replaceFaviconLinks(page, null, this.original);
  }
}

/**
 * Font size that keeps 1–3 characters readable at the badge radius.
 *
 * @param count Unread messages.
 * @param size Canvas size in pixels.
 * @returns Font size in pixels.
 */
function badgeFontSize(count: number, size: number): number {
  if (count < 10) return Math.round(size * 0.34);
  if (count <= COLLABORATION_CHAT_UNREAD_SHOWN) return Math.round(size * 0.26);
  return Math.round(size * 0.2);
}

/**
 * Creates a document canvas when the 2D context exists.
 *
 * @returns Canvas and context, or null.
 */
function defaultCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  if (typeof canvas.getContext !== 'function') return null;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  return { canvas, ctx };
}

/**
 * Loads an icon URL into an image that can be drawn on a canvas.
 *
 * @param href Icon URL.
 * @returns Image, or null on failure.
 */
function defaultLoadImage(href: string): Promise<CanvasImageSource | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = href;
  });
}

/**
 * Copies the document's current tab icon links.
 *
 * @param page Document.
 * @returns Snapshots, possibly empty.
 */
function snapshotFaviconLinks(page: Document): FaviconLinkSnapshot[] {
  const links = page.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
  const snapshots: FaviconLinkSnapshot[] = [];
  for (const node of Array.from(links)) {
    const link = node as HTMLLinkElement;
    const href = link.href || link.getAttribute('href') || '';
    if (!href) continue;
    snapshots.push({
      rel: link.rel || 'icon',
      href,
      type: link.type || '',
      sizes: link.sizes?.toString?.() || link.getAttribute('sizes') || '',
    });
  }
  return snapshots;
}

/**
 * Picks the sharpest original icon href, preferring a 32×32 PNG.
 *
 * @param snapshots Original icon links.
 * @returns Href, or null when none were found.
 */
function preferredFaviconHref(snapshots: readonly FaviconLinkSnapshot[]): string | null {
  const bySize = snapshots.find((entry) => entry.sizes.includes('32x32') && !entry.href.startsWith('data:'));
  if (bySize) return bySize.href;
  const png = snapshots.find((entry) => entry.type.includes('png') && !entry.href.startsWith('data:'));
  if (png) return png.href;
  const any = snapshots.find((entry) => !entry.href.startsWith('data:'));
  return any?.href ?? snapshots[0]?.href ?? null;
}

/**
 * Replaces tab icon links with a badged data URL, or restores the snapshots.
 *
 * @param page Document.
 * @param href Badged data URL, or null to restore.
 * @param original Links to restore when href is null.
 */
function replaceFaviconLinks(page: Document, href: string | null, original: readonly FaviconLinkSnapshot[] = []): void {
  const head = page.head;
  if (head === null) return;
  head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((node) => node.remove());
  if (href !== null) {
    const link = page.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.setAttribute('sizes', `${FAVICON_COLLABORATION_CHAT_SIZE}x${FAVICON_COLLABORATION_CHAT_SIZE}`);
    link.href = href;
    head.appendChild(link);
    link.setAttribute('href', href);
    return;
  }
  for (const spec of original) {
    const link = page.createElement('link');
    link.rel = spec.rel;
    if (spec.type) link.type = spec.type;
    if (spec.sizes) link.setAttribute('sizes', spec.sizes);
    link.href = spec.href;
    head.appendChild(link);
  }
}
