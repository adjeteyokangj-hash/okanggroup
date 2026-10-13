/** Relative luminance (sRGB) for WCAG contrast checks. */
function luminance(hex: string): number | null {
  const raw = hex.trim().replace('#', '');
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(foreground: string, background: string): number | null {
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  if (l1 == null || l2 == null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal text is 4.5:1 */
export function hasInsufficientContrast(
  foreground: string | undefined,
  background: string | undefined,
  minRatio = 4.5,
): boolean {
  if (!foreground || !background) return false;
  if (!foreground.startsWith('#') || !background.startsWith('#')) return false;
  const ratio = contrastRatio(foreground, background);
  if (ratio == null) return false;
  return ratio < minRatio;
}

export function contrastLabel(foreground: string, background: string): string {
  const ratio = contrastRatio(foreground, background);
  if (ratio == null) return '';
  return `${ratio.toFixed(1)}:1`;
}
