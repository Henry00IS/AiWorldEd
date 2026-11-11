import { dialogProjectHistoryReducedMotion } from './dialog_project_history_style.js';

/** Time each picture of the slideshow stays. */
export const DIALOG_PROJECT_HISTORY_SLIDE_MS = 3000;

/** Length of the fade between two pictures. */
const DIALOG_PROJECT_HISTORY_FADE_MS = 700;

/**
 * Fades between the pictures of the selected day. With reduced motion, or a
 * single picture, the newest picture stays still.
 */
export class DialogProjectHistorySlideshow {
  readonly element = document.createElement('div');
  private readonly layers: [HTMLElement, HTMLElement];
  private urls: string[] = [];
  private index = 0;
  private front = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private token = 0;

  /** Builds the empty slideshow. */
  constructor() {
    this.element.dataset['historySlideshow'] = '';
    this.element.setAttribute('aria-hidden', 'true');
    Object.assign(this.element.style, {
      position: 'relative',
      width: '100%',
      aspectRatio: '1',
      flex: 'none',
      overflow: 'hidden',
      borderRadius: '8px',
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
   * Shows the pictures of a day, in the given order.
   *
   * @param loads Picture loads; missing pictures are left out.
   */
  show(loads: ReadonlyArray<Promise<string | null>>): void {
    const token = ++this.token;
    this.timerClear();
    this.urls = [];
    this.layers.forEach((layer) => (layer.style.opacity = '0'));
    void Promise.all(loads).then((list) => {
      if (token !== this.token) return;
      this.urls = list.filter((url): url is string => url !== null);
      this.index = 0;
      const first = this.urls[0];
      if (first === undefined) return;
      this.paint(first);
      if (this.urls.length > 1 && !dialogProjectHistoryReducedMotion())
        this.timer = setInterval(() => this.next(), DIALOG_PROJECT_HISTORY_SLIDE_MS);
    });
  }

  /**
   * Returns the picture shown now.
   *
   * @returns URL, or null without pictures.
   */
  current(): string | null {
    return this.urls[this.index] ?? null;
  }

  /** Fades to the next picture. */
  private next(): void {
    this.index = (this.index + 1) % this.urls.length;
    this.front = 1 - this.front;
    this.paint(this.urls[this.index]!);
  }

  /**
   * Shows a picture on the front layer and fades the other one out.
   *
   * @param url Picture.
   */
  private paint(url: string): void {
    const shown = this.layers[this.front]!;
    shown.style.backgroundImage = `url("${url}")`;
    shown.style.opacity = '1';
    this.layers[1 - this.front]!.style.opacity = '0';
    this.element.dataset['historySlideshow'] = url;
  }

  /** Stops the slideshow timer. */
  private timerClear(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Stops the slideshow. */
  dispose(): void {
    this.token += 1;
    this.timerClear();
  }
}
