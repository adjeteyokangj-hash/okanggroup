/**
 * Contrast helpers for CMS page/card colour warnings.
 * Run: node src/lib/cmsBuilder/contrast.test.mjs
 */
import assert from 'node:assert/strict';

function luminance(hex) {
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

function contrastRatio(foreground, background) {
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  if (l1 == null || l2 == null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hasInsufficientContrast(foreground, background, minRatio = 4.5) {
  if (!foreground || !background) return false;
  if (!foreground.startsWith('#') || !background.startsWith('#')) return false;
  const ratio = contrastRatio(foreground, background);
  if (ratio == null) return false;
  return ratio < minRatio;
}

assert.ok((contrastRatio('#000000', '#ffffff') ?? 0) >= 4.5);
assert.equal(hasInsufficientContrast('#000000', '#ffffff'), false);
assert.ok((contrastRatio('#e8eef7', '#f7f4ef') ?? 99) < 4.5);
assert.equal(hasInsufficientContrast('#e8eef7', '#f7f4ef'), true);
assert.equal(hasInsufficientContrast('#1a1a1a', '#f7f4ef'), false);

console.log('cmsBuilder contrast tests ok');
