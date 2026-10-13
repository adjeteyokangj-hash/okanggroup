import type { CSSProperties } from 'react';
import type { CmsPageBrand } from '../cmsPage';
import type { BuilderNode, BuilderNodeStyle, BuilderTokens } from './types';

function align(v?: BuilderNodeStyle['align']) {
  if (v === 'center') return 'center';
  if (v === 'end') return 'flex-end';
  if (v === 'stretch') return 'stretch';
  return 'flex-start';
}

function justify(v?: BuilderNodeStyle['justify']) {
  switch (v) {
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'between':
      return 'space-between';
    case 'around':
      return 'space-around';
    default:
      return 'flex-start';
  }
}

export function resolveNodeStyle(
  style: BuilderNodeStyle | undefined,
  tokens: BuilderTokens,
): CSSProperties {
  if (!style) return {};
  const display = style.display ?? (style.direction || style.gridColumns ? 'flex' : undefined);
  const css: CSSProperties = {
    display,
    flexDirection: style.direction,
    flexWrap: style.wrap ? 'wrap' : undefined,
    gap: style.gap,
    alignItems: style.align ? align(style.align) : undefined,
    justifyContent: style.justify ? justify(style.justify) : undefined,
    gridTemplateColumns: style.gridColumns
      ? `repeat(${style.gridColumns}, minmax(0, 1fr))`
      : undefined,
    padding: style.padding,
    margin: style.margin,
    width: style.width,
    maxWidth: style.maxWidth,
    minHeight: style.minHeight,
    background:
      style.cardColor ||
      style.backgroundColor ||
      (undefined as string | undefined),
    color: style.color,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    borderStyle: style.borderWidth ? 'solid' : undefined,
    borderRadius: style.borderRadius,
    boxShadow: style.boxShadow,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight as CSSProperties['fontWeight'],
    lineHeight: style.lineHeight,
    textAlign: style.textAlign,
    opacity: style.opacity,
  };

  if (display === 'grid' || style.gridColumns) {
    css.display = 'grid';
  }

  // Prefer explicit cardColor for cards
  if (style.cardColor) {
    css.background = style.cardColor;
  }

  // Resolve CSS vars fallbacks for token references
  if (css.background === 'var(--cms-surface)') css.background = tokens.surface;
  if (css.background === 'var(--cms-primary)') css.background = tokens.primary;
  if (css.color === 'var(--cms-text)') css.color = tokens.text;

  return css;
}

export function pageCssVars(brand: CmsPageBrand, tokens: BuilderTokens): CSSProperties {
  return {
    ['--cms-primary' as string]: tokens.primary ?? brand.primaryColor ?? '#0b3d2e',
    ['--cms-accent' as string]: tokens.accent ?? brand.accentColor ?? '#c4a35a',
    ['--cms-bg' as string]: tokens.pageBackground ?? brand.backgroundColor ?? '#f7f4ef',
    ['--cms-surface' as string]: tokens.surface ?? brand.surfaceColor ?? '#ffffff',
    ['--cms-card' as string]: tokens.cardSurface ?? tokens.surface ?? '#ffffff',
    ['--cms-text' as string]: tokens.text ?? brand.textColor ?? '#1a1a1a',
    background: tokens.pageBackground ?? brand.backgroundColor ?? '#f7f4ef',
    color: tokens.text ?? brand.textColor ?? '#1a1a1a',
    fontFamily: brand.fontFamily,
  };
}

export function defaultCardFill(node: BuilderNode, tokens: BuilderTokens): string {
  return node.style?.cardColor || node.style?.backgroundColor || tokens.cardSurface || '#ffffff';
}
