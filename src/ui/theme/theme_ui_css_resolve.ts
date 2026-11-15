/** Matches a theme shadow opacity expression such as `calc(0.35 * 1)`. */
const THEME_CSS_SHADOW_CALC_PATTERN = /calc\(\s*([0-9.]+)\s*\*\s*1\s*\)/g;

/**
 * Replaces every themed CSS variable reference in a value with its fallback,
 * which is the dark theme color. Useful wherever a concrete color is needed
 * outside the DOM cascade, such as canvas drawing or comparisons.
 *
 * @param cssValue CSS value that may contain `var(--name, fallback)`
 *   references.
 * @returns The value with every reference replaced by its fallback.
 */
export function themeCssResolveDarkFallback(cssValue: string): string {
  let resolvedValue = cssValue;
  let referenceStart = resolvedValue.lastIndexOf('var(');
  while (referenceStart >= 0) {
    resolvedValue = themeCssReplaceVariableReferenceAt(resolvedValue, referenceStart);
    referenceStart = resolvedValue.lastIndexOf('var(');
  }
  return resolvedValue.replace(THEME_CSS_SHADOW_CALC_PATTERN, '$1');
}

/**
 * Replaces the `var()` reference that starts at the given index with its
 * fallback text (or an empty string when it has none).
 *
 * @param cssValue CSS value containing the reference.
 * @param referenceStart Index of the `var(` token.
 * @returns CSS value with that reference replaced.
 */
function themeCssReplaceVariableReferenceAt(cssValue: string, referenceStart: number): string {
  const argumentsStart = referenceStart + 'var('.length;
  let depth = 1;
  let fallbackStart = -1;
  let index = argumentsStart;
  for (; index < cssValue.length && depth > 0; index++) {
    const character = cssValue[index];
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;
    if (character === ',' && depth === 1 && fallbackStart < 0) {
      fallbackStart = index + 1;
    }
  }
  const referenceEnd = index;
  const fallbackText = fallbackStart < 0 ? '' : cssValue.slice(fallbackStart, referenceEnd - 1).trim();
  return cssValue.slice(0, referenceStart) + fallbackText + cssValue.slice(referenceEnd);
}

/**
 * Resolves a themed CSS value to its dark color and normalizes it the way the
 * browser reports inline style values (for example `#e0e0e0` becomes `rgb(224,
 * 224, 224)`).
 *
 * @param propertyName Camel-cased style property used for normalization.
 * @param cssValue Themed CSS value.
 * @returns Normalized dark theme value.
 */
export function themeCssResolveDarkStyleValue(propertyName: string, cssValue: string): string {
  const darkValue = themeCssResolveDarkFallback(cssValue);
  if (typeof document === 'undefined') {
    return darkValue;
  }
  const probeElement = document.createElement('div');
  probeElement.style.setProperty(
    propertyName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
    darkValue,
  );
  const normalizedValue = probeElement.style.getPropertyValue(
    propertyName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
  );
  return normalizedValue || darkValue;
}
