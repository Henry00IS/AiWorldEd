import type * as THREE from 'three';
import { FactoryObjectIcon } from './factory_object_icon.js';

/** Icon marker render options for outliner glyph and badge slots. */
export interface OutlinerItemIconMarker {
  character: string;
  color: string;
  cssDot: boolean;
  dotSizePx: number;
  nudgeYPx: number;
}

/**
 * Applies type icon character, color, and optional operation badge.
 *
 * @param object Hierarchy object for the row.
 * @param iconGlyphElement Primary glyph element.
 * @param iconBadgeElement Badge element for CSG operation dots.
 */
export function outlinerItemApplyIconFromObject(
  object: THREE.Object3D,
  iconGlyphElement: HTMLElement,
  iconBadgeElement: HTMLElement,
): void {
  const icon = FactoryObjectIcon.getIcon(object);
  outlinerItemApplyIconMarker(iconGlyphElement, {
    character: icon.character,
    color: icon.color,
    cssDot: icon.cssDot === true,
    dotSizePx: 8,
    nudgeYPx: icon.cssDotNudgeYPx ?? 0,
  });
  if (icon.badgeCssDot && icon.badgeColor) {
    outlinerItemApplyOverlayDot(iconBadgeElement, icon.badgeColor, 5);
    return;
  }
  if (icon.badgeCharacter && icon.badgeColor) {
    outlinerItemApplyIconMarker(iconBadgeElement, {
      character: icon.badgeCharacter,
      color: icon.badgeColor,
      cssDot: false,
      dotSizePx: 5,
      nudgeYPx: 0,
    });
    iconBadgeElement.style.display = 'inline-flex';
    return;
  }
  outlinerItemHideIconBadge(iconBadgeElement);
}

/**
 * Renders either a text glyph or a CSS circle into an icon slot.
 *
 * @param element Target glyph or badge element.
 * @param marker Render options.
 */
export function outlinerItemApplyIconMarker(element: HTMLElement, marker: OutlinerItemIconMarker): void {
  if (marker.cssDot) {
    outlinerItemApplyCenteredCssDot(element, marker.color, marker.dotSizePx, marker.nudgeYPx);
    return;
  }
  outlinerItemClearCssDotStyles(element);
  element.textContent = marker.character;
  element.style.color = marker.color;
  element.style.fontSize = '12px';
}

/**
 * Paints a pure CSS circle centered in the icon slot.
 *
 * @param element Glyph element that becomes the circle.
 * @param color Dot fill color.
 * @param sizePx Dot diameter in pixels.
 * @param nudgeYPx Extra downward offset in pixels (0 = true center).
 */
export function outlinerItemApplyCenteredCssDot(
  element: HTMLElement,
  color: string,
  sizePx: number,
  nudgeYPx: number,
): void {
  element.textContent = '';
  element.style.display = 'block';
  element.style.position = 'absolute';
  element.style.left = '50%';
  element.style.top = nudgeYPx === 0 ? '50%' : `calc(50% + ${nudgeYPx}px)`;
  element.style.transform = 'translate(-50%, -50%)';
  element.style.margin = '0';
  element.style.padding = '0';
  element.style.border = 'none';
  element.style.color = 'transparent';
  element.style.backgroundColor = color;
  element.style.borderRadius = '50%';
  element.style.width = `${sizePx}px`;
  element.style.height = `${sizePx}px`;
  element.style.fontSize = '0';
  element.style.lineHeight = '0';
  element.style.boxShadow = '0 0 0 1px rgba(0, 0, 0, calc(0.35 * var(--aiworlded-shadow-strength, 1)))';
}

/**
 * Places a small CSS operation dot centered over the folder body.
 *
 * @param element Badge element.
 * @param color Dot fill color.
 * @param sizePx Dot diameter in pixels.
 */
export function outlinerItemApplyOverlayDot(element: HTMLElement, color: string, sizePx: number): void {
  element.textContent = '';
  element.style.display = 'block';
  element.style.position = 'absolute';
  element.style.left = '50%';
  element.style.top = '58%';
  element.style.transform = 'translate(-50%, -50%)';
  element.style.margin = '0';
  element.style.padding = '0';
  element.style.border = 'none';
  element.style.backgroundColor = color;
  element.style.borderRadius = '50%';
  element.style.width = `${sizePx}px`;
  element.style.height = `${sizePx}px`;
  element.style.boxShadow = '0 0 0 1px rgba(0, 0, 0, calc(0.35 * var(--aiworlded-shadow-strength, 1)))';
  element.style.fontSize = '0';
  element.style.lineHeight = '0';
  element.style.color = 'transparent';
}

/**
 * Hides and resets the folder operation badge.
 *
 * @param iconBadgeElement Badge element.
 */
export function outlinerItemHideIconBadge(iconBadgeElement: HTMLElement): void {
  iconBadgeElement.textContent = '';
  outlinerItemClearCssDotStyles(iconBadgeElement);
  iconBadgeElement.style.display = 'none';
  iconBadgeElement.style.boxShadow = 'none';
}

/**
 * Clears CSS-circle styles so a slot can show a text glyph again.
 *
 * @param element Icon slot element.
 */
export function outlinerItemClearCssDotStyles(element: HTMLElement): void {
  element.style.display = 'inline-flex';
  element.style.position = 'static';
  element.style.left = '';
  element.style.top = '';
  element.style.transform = '';
  element.style.margin = '';
  element.style.padding = '';
  element.style.border = '';
  element.style.backgroundColor = 'transparent';
  element.style.borderRadius = '0';
  element.style.width = '14px';
  element.style.height = '16px';
  element.style.fontSize = '12px';
  element.style.lineHeight = '1';
  element.style.boxShadow = 'none';
  element.style.color = '';
}
