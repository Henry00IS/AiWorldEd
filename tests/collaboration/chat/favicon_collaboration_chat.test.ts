import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FaviconCollaborationChat,
  faviconCollaborationChatBadgeLabel,
  faviconCollaborationChatPaint,
} from '@/collaboration/chat/favicon_collaboration_chat.js';

/** Records 2D canvas calls used to paint the favicon badge. */
interface RecordingContext {
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
  texts: string[];
  fillStyles: string[];
  arcs: Array<{ x: number; y: number; r: number }>;
  rounded: Array<{ x: number; y: number; w: number; h: number }>;
  images: number;
  measureWidth: (text: string) => number;
}

/**
 * Builds a stub 2D context that records text, circles and the icon draw.
 *
 * @param measureWidth Width reported by measureText.
 * @returns Stub context.
 */
function recordingContext(
  measureWidth: (text: string) => number = (text) => text.length * 8,
): CanvasRenderingContext2D & RecordingContext {
  const rec: RecordingContext = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    lineWidth: 0,
    texts: [],
    fillStyles: [],
    arcs: [],
    rounded: [],
    images: 0,
    measureWidth,
  };
  const ctx: Record<string, unknown> = {
    scale() {},
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    fill() {},
    stroke() {},
    drawImage() {
      rec.images += 1;
    },
    arc(x: number, y: number, r: number) {
      rec.arcs.push({ x, y, r });
    },
    roundRect(x: number, y: number, w: number, h: number) {
      rec.rounded.push({ x, y, w, h });
    },
    fillText(text: string) {
      rec.texts.push(text);
    },
    measureText(text: string) {
      return { width: rec.measureWidth(text) };
    },
  };
  Object.defineProperties(ctx, {
    fillStyle: {
      get: () => rec.fillStyle,
      set: (value: string) => {
        rec.fillStyle = value;
        rec.fillStyles.push(value);
      },
    },
    strokeStyle: {
      get: () => rec.strokeStyle,
      set: (value: string) => {
        rec.strokeStyle = value;
      },
    },
    font: {
      get: () => rec.font,
      set: (value: string) => {
        rec.font = value;
      },
    },
    textAlign: {
      get: () => rec.textAlign,
      set: (value: string) => {
        rec.textAlign = value;
      },
    },
    textBaseline: {
      get: () => rec.textBaseline,
      set: (value: string) => {
        rec.textBaseline = value;
      },
    },
    lineWidth: {
      get: () => rec.lineWidth,
      set: (value: number) => {
        rec.lineWidth = value;
      },
    },
    texts: { get: () => rec.texts },
    fillStyles: { get: () => rec.fillStyles },
    arcs: { get: () => rec.arcs },
    rounded: { get: () => rec.rounded },
    images: { get: () => rec.images },
    measureWidth: { get: () => rec.measureWidth },
  });
  return ctx as unknown as CanvasRenderingContext2D & RecordingContext;
}

afterEach(() => {
  document.head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe('faviconCollaborationChatBadgeLabel', () => {
  it('matches the status bar for counts through 99', () => {
    expect(faviconCollaborationChatBadgeLabel(1, () => 10, 40)).toBe('1');
    expect(faviconCollaborationChatBadgeLabel(9, () => 10, 40)).toBe('9');
    expect(faviconCollaborationChatBadgeLabel(23, () => 16, 40)).toBe('23');
    expect(faviconCollaborationChatBadgeLabel(99, () => 16, 40)).toBe('99');
  });

  it('uses 99+ when it fits, otherwise 99', () => {
    expect(faviconCollaborationChatBadgeLabel(100, (text) => (text === '99+' ? 20 : 16), 40)).toBe('99+');
    expect(faviconCollaborationChatBadgeLabel(100, (text) => (text === '99+' ? 50 : 16), 40)).toBe('99');
  });
});

describe('faviconCollaborationChatPaint', () => {
  it('draws the icon and a red badge with the count', () => {
    const ctx = recordingContext();
    const icon = {} as CanvasImageSource;
    faviconCollaborationChatPaint(ctx, icon, 23, 128);
    expect(ctx.images).toBe(1);
    expect(ctx.texts).toEqual(['23']);
    expect(ctx.arcs.length + ctx.rounded.length).toBeGreaterThan(0);
    expect(ctx.texts).toEqual(['23']);
    expect(ctx.fillStyles).toContain('#e53935');
  });

  it('paints 1, 9, 99 and a fitted 99+ without drawing when the count is 0', () => {
    const empty = recordingContext();
    faviconCollaborationChatPaint(empty, null, 0, 128);
    expect(empty.texts).toEqual([]);
    expect(empty.arcs).toEqual([]);

    for (const [count, label] of [
      [1, '1'],
      [9, '9'],
      [99, '99'],
      [120, '99+'],
    ] as const) {
      const ctx = recordingContext((text) => (text === '99+' ? 18 : 12));
      faviconCollaborationChatPaint(ctx, null, count, 128);
      expect(ctx.texts, String(count)).toEqual([label]);
    }
  });
});

describe('FaviconCollaborationChat', () => {
  /**
   * Installs a canvas that returns a data URL and records painted labels.
   *
   * @param href Data URL returned by toDataURL.
   * @returns Painted labels and the canvas element.
   */
  function installCanvas(href: string): { canvas: HTMLCanvasElement } {
    const ctx = recordingContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () => href,
    } as unknown as HTMLCanvasElement;
    return { canvas };
  }

  it('replaces the favicon with a badged PNG and restores the original at 0', async () => {
    const original = document.createElement('link');
    original.rel = 'icon';
    original.type = 'image/png';
    original.setAttribute('sizes', '32x32');
    original.href = 'https://example.test/favicon-32x32.png';
    document.head.appendChild(original);
    const { canvas } = installCanvas('data:image/png;base64,BADGE');
    const favicon = new FaviconCollaborationChat({
      document,
      canvas: () => ({ canvas, ctx: canvas.getContext('2d')! }),
      loadImage: async () => ({}) as CanvasImageSource,
    });
    favicon.unreadSet(9);
    await vi.waitFor(() => {
      const icons = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
      expect(icons.some((link) => link.href.startsWith('data:image/png'))).toBe(true);
    });
    favicon.unreadSet(0);
    const restored = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(restored?.href).toContain('favicon-32x32.png');
    expect(restored?.href.startsWith('data:')).toBe(false);
    favicon.dispose();
  });

  it('is a no-op when canvas is unavailable', () => {
    const original = document.createElement('link');
    original.rel = 'icon';
    original.href = 'https://example.test/favicon.ico';
    document.head.appendChild(original);
    const favicon = new FaviconCollaborationChat({
      document,
      canvas: () => null,
    });
    favicon.unreadSet(3);
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href).toContain('favicon.ico');
    favicon.dispose();
  });

  it('does not throw without a document', () => {
    const favicon = new FaviconCollaborationChat({ document: null });
    expect(() => {
      favicon.unreadSet(4);
      favicon.dispose();
    }).not.toThrow();
  });
});
