import { dialogProjectHistoryReducedMotion } from './dialog_project_history_style.js';

/** Time each picture of a slideshow stays. */
export const DIALOG_PROJECT_HISTORY_SLIDE_MS = 3000;

/** Length of the fade between two pictures. */
const DIALOG_PROJECT_HISTORY_FADE_MS = 700;

/** Golden ratio share that spreads the start of the date slideshows. */
const DIALOG_PROJECT_HISTORY_SLIDE_SPREAD = 0.381966;

/**
 * Returns how much later than the first one the slideshow of a date row moves
 * on, so the rows never change all at once.
 *
 * @param index Row position.
 * @returns Delay in milliseconds, below one slide.
 */
export function dialogProjectHistorySlidePhase(index: number): number {
  return Math.round(((index * DIALOG_PROJECT_HISTORY_SLIDE_SPREAD) % 1) * DIALOG_PROJECT_HISTORY_SLIDE_MS);
}

/** Loads one picture: an object URL, or null without one. */
export type DialogProjectHistorySlideLoad = () => Promise<string | null>;

/**
 * Fades between the pictures of one date, newest first, loading each picture
 * when it is due. With reduced motion, or a single picture, the newest picture
 * stays still.
 */
export class DialogProjectHistorySlideshow {
  readonly element = document.createElement('div');
  private readonly layers: [HTMLElement, HTMLElement];
  private readonly phase: number;
  private loads: DialogProjectHistorySlideLoad[] = [];
  private key: string | null = null;
  private url: string | null = null;
  private index = 0;
  private front = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;

  /**
   * Builds the empty slideshow.
   *
   * @param size Edge in pixels.
   * @param phase Delay of the first change, from
   *   {@link dialogProjectHistorySlidePhase}.
   */
  constructor(size: number, phase: number) {
    this.phase = phase;
    this.element.dataset['historySlideshow'] = '';
    this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, {
      position: 'relative',
      width: `${size}px`,
      aspectRatio: '1',
      flex: 'none',
      overflow: 'hidden',
      borderRadius: '5px',
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'repeating-linear-gradient(45deg, #26262a 0 6px, #2c2c31 6px 12px)',
      boxSizing: 'border-box',
    });
    const fade = dialogProjectHistoryReducedMotion()
      ? 'none'
      : `opacity ${DIALOG_PROJECT_HISTORY_FADE_MS}ms ease-in-out`;
    const layer = () => {
      const element = document.createElement('div');
      Object.assign(element.style, {
        position: 'absolute',
        inset: '0',
        background: '#232323 center / cover no-repeat',
        opacity: '0',
        transition: fade,
      });
      return element;
    };
    this.layers = [layer(), layer()];
    this.element.append(...this.layers);
  }

  /**
   * Shows the pictures of a date. The same key keeps the running slideshow;
   * another key (a save was added or deleted) starts again from the newest.
   *
   * @param key Ids of the pictured saves.
   * @param loads Picture loads, newest first.
   */
  show(key: string, loads: readonly DialogProjectHistorySlideLoad[]): void {
    if (key === this.key) return;
    const token = ++this.token;
    this.timerClear();
    this.key = key;
    this.loads = [...loads];
    this.url = null;
    this.index = 0;
    this.element.dataset['historySlides'] = String(this.loads.length);
    this.element.dataset['historySlideshow'] = '';
    this.layers.forEach((layer) => {
      layer.style.opacity = '0';
      layer.style.backgroundImage = '';
    });
    void this.advance(token, 0, this.phase);
  }

  /**
   * Returns the picture shown now.
   *
   * @returns URL, or null without pictures.
   */
  current(): string | null {
    return this.url;
  }

  /**
   * Shows the next picture that loads, starting at an index, then waits for the
   * next change.
   *
   * @param token Show the change belongs to.
   * @param start First index to try.
   * @param extra Extra wait before the next change.
   */
  private async advance(token: number, start: number, extra: number): Promise<void> {
    for (let step = 0; step < this.loads.length; step++) {
      const index = (start + step) % this.loads.length;
      const url = await this.loads[index]!().catch(() => null);
      if (token !== this.token) return;
      if (url === null) continue;
      if (url !== this.url) this.paint(url);
      this.index = index;
      break;
    }
    if (this.url === null || this.loads.length < 2 || dialogProjectHistoryReducedMotion()) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.advance(token, this.index + 1, 0);
    }, DIALOG_PROJECT_HISTORY_SLIDE_MS + extra);
  }

  /**
   * Shows a picture on the back layer and fades it in over the other one.
   *
   * @param url Picture.
   */
  private paint(url: string): void {
    if (this.url !== null) this.front = 1 - this.front;
    const shown = this.layers[this.front]!;
    shown.style.backgroundImage = `url("${url}")`;
    shown.style.opacity = '1';
    this.layers[1 - this.front]!.style.opacity = '0';
    this.url = url;
    this.element.dataset['historySlideshow'] = url;
  }

  /** Stops the slideshow timer. */
  private timerClear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Stops the slideshow. */
  dispose(): void {
    this.token += 1;
    this.timerClear();
  }
}
