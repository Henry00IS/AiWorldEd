import { Theme } from '@/theme.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { NATIVE_CONTEXT_MENU_ATTRIBUTE } from '@/ui/input/native_browser_defaults.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';

/** What the image lightbox shows. */
export interface LightboxImageOptions {
  /** Image URL, also opened by Open in New Tab. */
  url: string;
  /** Name shown under the image and used as the image's alternative text. */
  name: string;
  /** Optional detail shown after the name, such as the file size. */
  detail?: string;
}

/** Space kept free around the image for the close button and caption. */
const LIGHTBOX_IMAGE_MARGIN_PX = 64;

/** Images whose longer side is shorter than this are enlarged by whole pixels. */
export const LIGHTBOX_IMAGE_SMALL_PX = 256;

/** Height of the caption under the image. */
const LIGHTBOX_IMAGE_CAPTION_PX = 40;

/**
 * Full-window image viewer above the editor: the image fits the window, a
 * caption names it and offers Open in New Tab, and Escape, a click beside the
 * image or the close button closes it. Only one is open at a time.
 */
export class LightboxImage {
  private static current: LightboxImage | null = null;
  readonly root: HTMLElement;
  readonly image: HTMLImageElement;
  readonly closeButton: HTMLButtonElement;
  readonly openLink: HTMLAnchorElement;
  private readonly keyDown: (event: KeyboardEvent) => void;
  private readonly onClose: (() => void) | null;
  private readonly focusBefore: Element | null;

  /**
   * Opens a lightbox, closing the one already open.
   *
   * @param options Image to show.
   * @param onClose Called once the lightbox closes.
   * @returns The open lightbox.
   */
  static open(options: LightboxImageOptions, onClose: (() => void) | null = null): LightboxImage {
    LightboxImage.current?.close();
    const lightbox = new LightboxImage(options, onClose);
    LightboxImage.current = lightbox;
    return lightbox;
  }

  /**
   * Returns the open lightbox.
   *
   * @returns Lightbox, or null when none is open.
   */
  static active(): LightboxImage | null {
    return LightboxImage.current;
  }

  /**
   * Builds the lightbox and adds it to the page.
   *
   * @param options Image to show.
   * @param onClose Called once the lightbox closes.
   */
  private constructor(options: LightboxImageOptions, onClose: (() => void) | null) {
    this.onClose = onClose;
    this.focusBefore = document.activeElement;
    this.image = lightboxImageElement(options);
    this.openLink = lightboxImageOpenLink(options.url);
    this.closeButton = lightboxImageCloseButton(() => this.close());
    this.root = lightboxImageBackdrop();
    this.root.append(this.closeButton, lightboxImageFigure(this.image, lightboxImageCaption(options, this.openLink)));
    this.root.addEventListener('mousedown', (event) => this.backdropPressed(event));
    this.keyDown = (event) => this.keyPressed(event);
    document.addEventListener('keydown', this.keyDown, true);
    FloatingPanelStack.registerPointerBlockSurface(this.root);
    document.body.append(this.root);
    this.closeButton.focus({ preventScroll: true });
  }

  /** Removes the lightbox from the page. */
  close(): void {
    if (!this.root.isConnected) return;
    document.removeEventListener('keydown', this.keyDown, true);
    FloatingPanelStack.unregisterPointerBlockSurface(this.root);
    this.root.remove();
    if (LightboxImage.current === this) LightboxImage.current = null;
    if (this.focusBefore instanceof HTMLElement && this.focusBefore.isConnected) this.focusBefore.focus();
    this.onClose?.();
  }

  /**
   * Closes on a press beside the image and its caption; presses never reach the
   * editor behind.
   *
   * @param event Mouse down on the lightbox.
   */
  private backdropPressed(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.contentContains(event.target)) this.close();
  }

  /**
   * Returns whether a press landed on the image, its caption text, the Open in
   * New Tab link or the close button.
   *
   * @param target Pressed node.
   * @returns True for content that keeps the lightbox open.
   */
  private contentContains(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false;
    if (target === this.image || this.openLink.contains(target) || this.closeButton.contains(target)) return true;
    return target instanceof HTMLElement && target.closest('.editor-lightbox-caption-text') !== null;
  }

  /**
   * Closes on Escape before any editor shortcut sees it.
   *
   * @param event Key down anywhere on the page.
   */
  private keyPressed(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }
}

/**
 * Creates the dimmed full-window backdrop.
 *
 * @returns Backdrop element.
 */
function lightboxImageBackdrop(): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'editor-lightbox';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Image Viewer');
  backdrop.style.cssText = `position:fixed;inset:0;z-index:${UiStackLayers.aboveExclusiveShield};display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.86);font-family:${Theme.uiFontFamily};user-select:none`;
  return backdrop;
}

/**
 * Creates the column holding the image and its caption.
 *
 * @param image Image element.
 * @param caption Caption element.
 * @returns Figure element.
 */
function lightboxImageFigure(image: HTMLImageElement, caption: HTMLElement): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'editor-lightbox-figure';
  figure.style.cssText = 'margin:0;display:flex;flex-direction:column;align-items:flex-start;gap:8px;max-width:100%';
  figure.append(image, caption);
  return figure;
}

/**
 * Creates the image, scaled down to fit the window but never scaled up.
 *
 * @param options Image to show.
 * @returns Image element.
 */
function lightboxImageElement(options: LightboxImageOptions): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'editor-lightbox-image';
  image.src = options.url;
  image.alt = options.name;
  image.draggable = false;
  image.setAttribute(NATIVE_CONTEXT_MENU_ATTRIBUTE, '');
  const maximumHeight = `calc(100vh - ${LIGHTBOX_IMAGE_MARGIN_PX * 2 + LIGHTBOX_IMAGE_CAPTION_PX}px)`;
  image.addEventListener('load', () => lightboxImageSmallEnlarge(image), { once: true });
  image.style.cssText = `display:block;max-width:calc(100vw - ${LIGHTBOX_IMAGE_MARGIN_PX * 2}px);max-height:${maximumHeight};object-fit:contain;border-radius:4px;box-shadow:0 12px 48px rgba(0,0,0,0.7);background:rgba(255,255,255,0.04)`;
  return image;
}

/**
 * Enlarges a small image, such as a texture, by a whole factor with crisp
 * pixels so its longer side reaches the small image size.
 *
 * @param image Loaded image.
 */
export function lightboxImageSmallEnlarge(image: HTMLImageElement): void {
  const longer = Math.max(image.naturalWidth, image.naturalHeight);
  if (longer <= 0 || longer >= LIGHTBOX_IMAGE_SMALL_PX) return;
  const factor = Math.ceil(LIGHTBOX_IMAGE_SMALL_PX / longer);
  image.style.width = `${image.naturalWidth * factor}px`;
  image.style.height = `${image.naturalHeight * factor}px`;
  image.style.imageRendering = 'pixelated';
}

/**
 * Creates the caption: name and detail, then Open in New Tab.
 *
 * @param options Image to show.
 * @param openLink Open in New Tab link.
 * @returns Caption element.
 */
function lightboxImageCaption(options: LightboxImageOptions, openLink: HTMLAnchorElement): HTMLElement {
  const caption = document.createElement('figcaption');
  caption.className = 'editor-lightbox-caption';
  caption.style.cssText = 'display:flex;align-items:center;gap:12px;max-width:100%;min-width:0;line-height:20px';
  const text = document.createElement('span');
  text.className = 'editor-lightbox-caption-text';
  text.dir = 'auto';
  text.textContent = options.detail === undefined ? options.name : `${options.name} \u00b7 ${options.detail}`;
  text.title = options.name;
  text.style.cssText = `font-size:13px;color:${Theme.buttonTextColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;user-select:text`;
  caption.append(text, openLink);
  return caption;
}

/**
 * Creates the Open in New Tab link.
 *
 * @param url Image URL.
 * @returns Link element.
 */
function lightboxImageOpenLink(url: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'editor-lightbox-open';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open in New Tab';
  link.style.cssText = 'flex:0 0 auto;font-size:13px;font-weight:600;color:#6cb6ff;text-decoration:none;cursor:pointer';
  link.addEventListener('mouseenter', () => (link.style.textDecoration = 'underline'));
  link.addEventListener('mouseleave', () => (link.style.textDecoration = 'none'));
  return link;
}

/**
 * Creates the round close button in the top-right corner of the window.
 *
 * @param close Closes the lightbox.
 * @returns Button element.
 */
function lightboxImageCloseButton(close: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-lightbox-close';
  button.textContent = '\u2715';
  button.title = 'Close (Esc)';
  button.setAttribute('aria-label', 'Close');
  button.style.cssText = `position:absolute;top:16px;right:16px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,0.14);background:rgba(30,30,30,0.9);color:${Theme.buttonTextColor};font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;outline:none`;
  button.addEventListener('mouseenter', () => (button.style.background = 'rgba(60,60,60,0.95)'));
  button.addEventListener('mouseleave', () => (button.style.background = 'rgba(30,30,30,0.9)'));
  button.addEventListener('click', close);
  return button;
}
