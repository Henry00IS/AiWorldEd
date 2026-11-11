import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIGHTBOX_IMAGE_SMALL_PX, LightboxImage, lightboxImageSmallEnlarge } from '@/ui/lightbox/lightbox_image.js';

const IMAGE_URL = 'https://relay.test/ws/transfer/' + 'a'.repeat(43);

/**
 * Presses a key on the page.
 *
 * @param key Key name.
 * @returns The dispatched event.
 */
function keyPress(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

/**
 * Presses the mouse on an element.
 *
 * @param target Element.
 */
function mousePress(target: Element): void {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

afterEach(() => {
  LightboxImage.active()?.close();
  document.body.innerHTML = '';
});

describe('LightboxImage', () => {
  it('shows the image with its name, detail and an Open in New Tab link', () => {
    const lightbox = LightboxImage.open({ url: IMAGE_URL, name: 'shot.png', detail: '1.20 MB' });
    expect(lightbox.root.isConnected).toBe(true);
    expect(lightbox.image.src).toBe(IMAGE_URL);
    expect(lightbox.image.alt).toBe('shot.png');
    expect(lightbox.root.textContent).toContain('shot.png \u00b7 1.20 MB');
    expect(lightbox.openLink.textContent).toBe('Open in New Tab');
    expect(lightbox.openLink.href).toBe(IMAGE_URL);
    expect(lightbox.openLink.target).toBe('_blank');
    expect(lightbox.openLink.rel).toBe('noopener noreferrer');
  });

  it('closes on Escape without letting the editor see the key', () => {
    const lightbox = LightboxImage.open({ url: IMAGE_URL, name: 'shot.png' });
    const editorKeys = vi.fn();
    document.addEventListener('keydown', editorKeys);
    const event = keyPress('Escape');
    document.removeEventListener('keydown', editorKeys);
    expect(lightbox.root.isConnected).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(editorKeys).not.toHaveBeenCalled();
    expect(LightboxImage.active()).toBeNull();
  });

  it('closes on a press beside the image but not on the image or its caption', () => {
    const lightbox = LightboxImage.open({ url: IMAGE_URL, name: 'shot.png' });
    mousePress(lightbox.image);
    mousePress(lightbox.openLink);
    mousePress(lightbox.root.querySelector('.editor-lightbox-caption-text') as Element);
    expect(lightbox.root.isConnected).toBe(true);
    mousePress(lightbox.root);
    expect(lightbox.root.isConnected).toBe(false);
  });

  it('closes with the close button and calls back once', () => {
    const closed = vi.fn();
    const lightbox = LightboxImage.open({ url: IMAGE_URL, name: 'shot.png' }, closed);
    lightbox.closeButton.click();
    lightbox.close();
    expect(lightbox.root.isConnected).toBe(false);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('keeps only one lightbox open', () => {
    const first = LightboxImage.open({ url: IMAGE_URL, name: 'one.png' });
    const second = LightboxImage.open({ url: IMAGE_URL, name: 'two.png' });
    expect(first.root.isConnected).toBe(false);
    expect(document.querySelectorAll('.editor-lightbox')).toHaveLength(1);
    expect(LightboxImage.active()).toBe(second);
  });

  it('gives focus back to what had it before', () => {
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    const lightbox = LightboxImage.open({ url: IMAGE_URL, name: 'shot.png' });
    expect(document.activeElement).toBe(lightbox.closeButton);
    keyPress('Escape');
    expect(document.activeElement).toBe(field);
  });

  it('ignores other keys', () => {
    const lightbox = LightboxImage.open({ url: IMAGE_URL, name: 'shot.png' });
    expect(keyPress('a').defaultPrevented).toBe(false);
    expect(lightbox.root.isConnected).toBe(true);
  });
});

describe('lightboxImageSmallEnlarge', () => {
  /**
   * Creates an image that reports a natural size.
   *
   * @param width Natural width.
   * @param height Natural height.
   * @returns Image element.
   */
  function sizedImage(width: number, height: number): HTMLImageElement {
    const image = document.createElement('img');
    Object.defineProperty(image, 'naturalWidth', { value: width });
    Object.defineProperty(image, 'naturalHeight', { value: height });
    return image;
  }

  it('enlarges a small texture by a whole factor with crisp pixels', () => {
    const image = sizedImage(16, 8);
    lightboxImageSmallEnlarge(image);
    const factor = Math.ceil(LIGHTBOX_IMAGE_SMALL_PX / 16);
    expect(image.style.width).toBe(`${16 * factor}px`);
    expect(image.style.height).toBe(`${8 * factor}px`);
    expect(image.style.imageRendering).toBe('pixelated');
  });

  it('leaves large images at their own size', () => {
    const image = sizedImage(LIGHTBOX_IMAGE_SMALL_PX, 40);
    lightboxImageSmallEnlarge(image);
    expect(image.style.width).toBe('');
    expect(image.style.imageRendering).toBe('');
  });
});
