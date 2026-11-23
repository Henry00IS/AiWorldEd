/** Crosshair color while the beam would hook what it aims at. */
const PLAYER_GRAPPLE_CROSSHAIR_HOOK = '#42d9ff';

/** Crosshair color while nothing is in reach. */
const PLAYER_GRAPPLE_CROSSHAIR_IDLE = 'rgba(244, 241, 232, 0.55)';

/**
 * The grapple beam's crosshair: four short ticks and a dot at the middle of the
 * play viewport (where the beam fires), lit in the beam color and opened up a
 * little while something is in reach.
 */
export class PlayerGrappleCrosshair {
  private readonly element: HTMLDivElement;
  private readonly parts: HTMLDivElement[];
  private shown = false;
  private hooks: boolean | null = null;

  /**
   * Builds the crosshair (detached, hidden).
   *
   * @param ownerDocument Document to build in.
   */
  constructor(ownerDocument: Document) {
    this.element = ownerDocument.createElement('div');
    this.element.className = 'player-grapple-crosshair';
    Object.assign(this.element.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: '0',
      height: '0',
      pointerEvents: 'none',
      zIndex: '5',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.parts = [0, 90, 180, 270].map((angle) => this.tick(ownerDocument, angle));
    const dot = ownerDocument.createElement('div');
    Object.assign(dot.style, {
      position: 'absolute',
      left: '-1.5px',
      top: '-1.5px',
      width: '3px',
      height: '3px',
      borderRadius: '50%',
    } satisfies Partial<CSSStyleDeclaration>);
    this.parts.push(dot);
    this.element.append(...this.parts);
    this.set(false, false);
  }

  /**
   * Shows the crosshair over a viewport.
   *
   * @param container Viewport content element.
   */
  mount(container: HTMLElement): void {
    container.appendChild(this.element);
  }

  /** Takes the crosshair away. */
  unmount(): void {
    this.element.remove();
  }

  /**
   * Shows or hides it, lit when the beam would hook.
   *
   * @param shown Whether the grapple beam is picked.
   * @param hooks Whether something is in reach at the middle of the view.
   */
  set(shown: boolean, hooks: boolean): void {
    if (shown !== this.shown) this.element.style.display = shown ? 'block' : 'none';
    this.shown = shown;
    if (hooks === this.hooks) return;
    this.hooks = hooks;
    this.element.dataset['hooks'] = String(hooks);
    const color = hooks ? PLAYER_GRAPPLE_CROSSHAIR_HOOK : PLAYER_GRAPPLE_CROSSHAIR_IDLE;
    const glow = hooks ? `0 0 4px ${PLAYER_GRAPPLE_CROSSHAIR_HOOK}, 0 0 1px #000` : '0 0 1px #000';
    this.parts.forEach((part, index) => {
      part.style.background = color;
      part.style.boxShadow = glow;
      if (index < 4) part.style.transform = `rotate(${index * 90}deg) translateY(${hooks ? -7 : -5}px)`;
    });
  }

  /**
   * Returns the crosshair element.
   *
   * @returns Element.
   */
  getElement(): HTMLDivElement {
    return this.element;
  }

  /**
   * Builds one tick pointing out from the middle.
   *
   * @param ownerDocument Document.
   * @param angle Direction in degrees (0: up).
   * @returns Tick.
   */
  private tick(ownerDocument: Document, angle: number): HTMLDivElement {
    const tick = ownerDocument.createElement('div');
    Object.assign(tick.style, {
      position: 'absolute',
      left: '-1px',
      top: '-6px',
      width: '2px',
      height: '6px',
      transformOrigin: '1px 6px',
      transform: `rotate(${angle}deg)`,
    } satisfies Partial<CSSStyleDeclaration>);
    return tick;
  }
}
