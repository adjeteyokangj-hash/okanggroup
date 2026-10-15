import type { ChangeEvent } from 'react';
import type { OpsWatchEditorBridge } from '../../components/OpsWatchMarketingEditor';
import { sectionIdFromSelection } from '../../lib/opswatchCmsSelection';
import type {
  MarketingCta,
  MarketingImage,
  MarketingPageContent,
  MarketingSection,
  MarketingVisualStyle,
} from '../../lib/opswatchMarketing';
import {
  STUDIO_FONT_FAMILIES,
  STUDIO_FONT_SIZES,
  STUDIO_SHADOWS,
  patchStyle,
} from '../../lib/marketingVisualStyle';

function getSelectionStyle(
  page: MarketingPageContent,
  selection: OpsWatchEditorBridge['selection'],
): MarketingVisualStyle | undefined {
  const sid = sectionIdFromSelection(selection);
  switch (selection.kind) {
    case 'hero':
      return page.hero.style;
    case 'heroCta':
      return selection.which === 'primary'
        ? page.hero.primaryCta?.style
        : page.hero.secondaryCta?.style;
    case 'heroImage':
      return page.hero.image?.style;
    case 'section': {
      return page.sections.find((s) => s.id === sid)?.style;
    }
    case 'card': {
      const section = page.sections.find((s) => s.id === sid);
      return section?.cards?.find((c) => c.id === selection.cardId)?.style;
    }
    case 'sectionCta': {
      const section = page.sections.find((s) => s.id === sid);
      return section?.ctas?.[selection.ctaIndex]?.style;
    }
    case 'sectionImage': {
      return page.sections.find((s) => s.id === sid)?.image?.style;
    }
    default:
      return undefined;
  }
}

function applySelectionStyle(
  page: MarketingPageContent,
  selection: OpsWatchEditorBridge['selection'],
  style: MarketingVisualStyle | undefined,
): MarketingPageContent {
  const sid = sectionIdFromSelection(selection);
  switch (selection.kind) {
    case 'hero':
      return { ...page, hero: { ...page.hero, style } };
    case 'heroCta': {
      if (selection.which === 'primary') {
        const cta = { ...(page.hero.primaryCta ?? { label: 'Primary', href: '/' }), style };
        return { ...page, hero: { ...page.hero, primaryCta: cta } };
      }
      const cta = { ...(page.hero.secondaryCta ?? { label: 'Secondary', href: '/' }), style };
      return { ...page, hero: { ...page.hero, secondaryCta: cta } };
    }
    case 'heroImage': {
      const image: MarketingImage = {
        ...(page.hero.image ?? { url: '', alt: '' }),
        style,
      };
      return { ...page, hero: { ...page.hero, image } };
    }
    case 'section':
      return {
        ...page,
        sections: page.sections.map((s) => (s.id === sid ? { ...s, style } : s)),
      };
    case 'card':
      return {
        ...page,
        sections: page.sections.map((s) =>
          s.id !== sid
            ? s
            : {
                ...s,
                cards: (s.cards ?? []).map((c) =>
                  c.id === selection.cardId ? { ...c, style } : c,
                ),
              },
        ),
      };
    case 'sectionCta':
      return {
        ...page,
        sections: page.sections.map((s) => {
          if (s.id !== sid) return s;
          const ctas = [...(s.ctas ?? [])];
          const existing = ctas[selection.ctaIndex] ?? { label: 'Button', href: '/' };
          ctas[selection.ctaIndex] = { ...existing, style };
          return { ...s, ctas };
        }),
      };
    case 'sectionImage':
      return {
        ...page,
        sections: page.sections.map((s) => {
          if (s.id !== sid) return s;
          const image: MarketingImage = { ...(s.image ?? { url: '', alt: '' }), style };
          return { ...s, image };
        }),
      };
    default:
      return page;
  }
}

function useStyleEditor(bridge: OpsWatchEditorBridge | null) {
  if (!bridge?.page) return null;
  const { page, selection, canEdit, applyPage } = bridge;
  const style = getSelectionStyle(page, selection);
  const patch = (partial: Partial<MarketingVisualStyle>) => {
    if (!canEdit) return;
    applyPage((p) =>
      applySelectionStyle(p, selection, patchStyle(getSelectionStyle(p, selection), partial)),
    );
  };
  return { page, selection, canEdit, applyPage, style, patch };
}

function TypographyFields({
  style,
  canEdit,
  onPatch,
}: {
  style?: MarketingVisualStyle;
  canEdit: boolean;
  onPatch: (p: Partial<MarketingVisualStyle>) => void;
}) {
  return (
    <>
      <label>
        Font family
        <select
          value={style?.fontFamily ?? ''}
          disabled={!canEdit}
          onChange={(e) => onPatch({ fontFamily: e.target.value })}
        >
          {STUDIO_FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Font size
        <select
          value={style?.fontSize ?? ''}
          disabled={!canEdit}
          onChange={(e) => onPatch({ fontSize: e.target.value })}
        >
          <option value="">Inherit</option>
          {STUDIO_FONT_SIZES.filter(Boolean).map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <label>
        Weight
        <select
          value={style?.fontWeight ?? ''}
          disabled={!canEdit}
          onChange={(e) => onPatch({ fontWeight: e.target.value })}
        >
          <option value="">Inherit</option>
          <option value="400">Regular</option>
          <option value="500">Medium</option>
          <option value="600">Semibold</option>
          <option value="700">Bold</option>
        </select>
      </label>
      <label>
        Alignment
        <select
          value={style?.textAlign ?? ''}
          disabled={!canEdit}
          onChange={(e) =>
            onPatch({
              textAlign: (e.target.value || undefined) as MarketingVisualStyle['textAlign'],
            })
          }
        >
          <option value="">Inherit</option>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label>
        Line height
        <select
          value={style?.lineHeight ?? ''}
          disabled={!canEdit}
          onChange={(e) => onPatch({ lineHeight: e.target.value })}
        >
          <option value="">Inherit</option>
          <option value="1.2">Tight</option>
          <option value="1.45">Normal</option>
          <option value="1.7">Relaxed</option>
        </select>
      </label>
      <label>
        Letter spacing
        <select
          value={style?.letterSpacing ?? ''}
          disabled={!canEdit}
          onChange={(e) => onPatch({ letterSpacing: e.target.value })}
        >
          <option value="">Inherit</option>
          <option value="-0.02em">Tight</option>
          <option value="0.02em">Slight</option>
          <option value="0.08em">Wide</option>
        </select>
      </label>
      <label>
        Text colour
        <input
          type="color"
          disabled={!canEdit}
          value={style?.color && /^#/.test(style.color) ? style.color : '#e8eef5'}
          onChange={(e) => onPatch({ color: e.target.value })}
        />
      </label>
      <label>
        Text colour HEX
        <input
          value={style?.color ?? ''}
          disabled={!canEdit}
          placeholder="#e8eef5"
          onChange={(e) => onPatch({ color: e.target.value })}
        />
      </label>
    </>
  );
}

export function OpsWatchTextTool({ bridge }: { bridge: OpsWatchEditorBridge | null }) {
  const editor = useStyleEditor(bridge);
  if (!bridge?.page || !editor) {
    return <p className="vs-tool-hint">Load a page module to edit typography.</p>;
  }
  const { page, selection, canEdit, applyPage, style, patch } = editor;
  const sid = sectionIdFromSelection(selection);

  const copyFields = (() => {
    if (selection.kind === 'hero') {
      return (
        <>
          <label>
            Headline
            <input
              value={page.hero.title}
              disabled={!canEdit}
              onChange={(e) =>
                applyPage((p) => ({ ...p, hero: { ...p.hero, title: e.target.value } }))
              }
            />
          </label>
          <label>
            Supporting sentence
            <textarea
              rows={3}
              value={page.hero.subtitle}
              disabled={!canEdit}
              onChange={(e) =>
                applyPage((p) => ({ ...p, hero: { ...p.hero, subtitle: e.target.value } }))
              }
            />
          </label>
        </>
      );
    }
    if (selection.kind === 'card' && sid) {
      const section = page.sections.find((s) => s.id === sid);
      const card = section?.cards?.find((c) => c.id === selection.cardId);
      if (!card || !section) return <p className="vs-tool-hint">Select a feature card.</p>;
      return (
        <>
          <label>
            Title
            <input
              value={card.title}
              disabled={!canEdit}
              onChange={(e) => {
                const title = e.target.value;
                applyPage((p) => ({
                  ...p,
                  sections: p.sections.map((s) =>
                    s.id !== section.id
                      ? s
                      : {
                          ...s,
                          cards: (s.cards ?? []).map((c) =>
                            c.id === card.id ? { ...c, title } : c,
                          ),
                        },
                  ),
                }));
              }}
            />
          </label>
          <label>
            Description
            <textarea
              rows={4}
              value={card.body}
              disabled={!canEdit}
              onChange={(e) => {
                const body = e.target.value;
                applyPage((p) => ({
                  ...p,
                  sections: p.sections.map((s) =>
                    s.id !== section.id
                      ? s
                      : {
                          ...s,
                          cards: (s.cards ?? []).map((c) =>
                            c.id === card.id ? { ...c, body } : c,
                          ),
                        },
                  ),
                }));
              }}
            />
          </label>
        </>
      );
    }
    if (selection.kind === 'section' && sid) {
      const section = page.sections.find((s) => s.id === sid);
      if (!section) return <p className="vs-tool-hint">Select a section.</p>;
      return (
        <>
          <label>
            Section title
            <input
              value={section.title ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                applyPage((p) => ({
                  ...p,
                  sections: p.sections.map((s) =>
                    s.id === section.id ? { ...s, title: e.target.value } : s,
                  ),
                }))
              }
            />
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={section.body ?? ''}
              disabled={!canEdit}
              onChange={(e) =>
                applyPage((p) => ({
                  ...p,
                  sections: p.sections.map((s) =>
                    s.id === section.id ? { ...s, body: e.target.value } : s,
                  ),
                }))
              }
            />
          </label>
        </>
      );
    }
    if (selection.kind === 'heroCta' || selection.kind === 'sectionCta') {
      return (
        <p className="vs-tool-hint">
          Button label and link are edited in Properties. Typography below styles this button on the
          draft canvas.
        </p>
      );
    }
    return (
      <p className="vs-tool-hint">
        Select a hero, section or feature card for copy. Style controls below apply to the current
        selection.
      </p>
    );
  })();

  const styleTarget =
    selection.kind === 'hero' ||
    selection.kind === 'section' ||
    selection.kind === 'card' ||
    selection.kind === 'heroCta' ||
    selection.kind === 'sectionCta';

  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Changes update the draft canvas immediately. Save draft to persist. Live OpsWatch theme may
        still apply site CSS for fields it does not yet render.
      </p>
      {copyFields}
      {styleTarget ? (
        <>
          <hr className="vs-tool-rule" />
          <TypographyFields style={style} canEdit={canEdit} onPatch={patch} />
        </>
      ) : null}
    </div>
  );
}

export function OpsWatchColourTool({ bridge }: { bridge: OpsWatchEditorBridge | null }) {
  const editor = useStyleEditor(bridge);
  if (!editor) return <p className="vs-tool-hint">Load a page to edit colour.</p>;
  const { selection, canEdit, style, patch, page, applyPage } = editor;
  const sid = sectionIdFromSelection(selection);
  const section = sid ? page.sections.find((s) => s.id === sid) : null;

  const styleable =
    selection.kind === 'hero' ||
    selection.kind === 'section' ||
    selection.kind === 'card' ||
    selection.kind === 'heroCta' ||
    selection.kind === 'sectionCta' ||
    selection.kind === 'heroImage' ||
    selection.kind === 'sectionImage';

  if (!styleable) {
    return (
      <p className="vs-tool-hint">
        Select a hero, section, card, button or image to edit colour and background.
      </p>
    );
  }

  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Colours apply on the draft canvas and save with the draft JSON. Section tone remains available
        for OpsWatch band/soft presets.
      </p>
      {section ? (
        <label>
          Section tone (OpsWatch preset)
          <select
            value={section.tone ?? 'default'}
            disabled={!canEdit}
            onChange={(e) => {
              const tone = e.target.value as MarketingSection['tone'];
              applyPage((p) => ({
                ...p,
                sections: p.sections.map((s) => (s.id === section.id ? { ...s, tone } : s)),
              }));
            }}
          >
            <option value="default">Default</option>
            <option value="band">Band</option>
            <option value="soft">Soft</option>
          </select>
        </label>
      ) : null}
      <label>
        Fill / background
        <input
          type="color"
          disabled={!canEdit}
          value={
            style?.backgroundColor && /^#/.test(style.backgroundColor)
              ? style.backgroundColor
              : '#0b1f33'
          }
          onChange={(e) => patch({ backgroundColor: e.target.value })}
        />
      </label>
      <label>
        Background HEX
        <input
          value={style?.backgroundColor ?? ''}
          disabled={!canEdit}
          placeholder="#0b1f33"
          onChange={(e) => patch({ backgroundColor: e.target.value })}
        />
      </label>
      <label>
        Gradient (CSS)
        <input
          value={style?.backgroundGradient ?? ''}
          disabled={!canEdit}
          placeholder="linear-gradient(180deg, #0b1f33, #13283f)"
          onChange={(e) => patch({ backgroundGradient: e.target.value })}
        />
      </label>
      <label>
        Text / foreground
        <input
          type="color"
          disabled={!canEdit}
          value={style?.color && /^#/.test(style.color) ? style.color : '#e8eef5'}
          onChange={(e) => patch({ color: e.target.value })}
        />
      </label>
      <label>
        Border colour
        <input
          type="color"
          disabled={!canEdit}
          value={style?.borderColor && /^#/.test(style.borderColor) ? style.borderColor : '#3a5473'}
          onChange={(e) => patch({ borderColor: e.target.value, borderWidth: style?.borderWidth || '1px' })}
        />
      </label>
      <label>
        Border width
        <select
          value={style?.borderWidth ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ borderWidth: e.target.value })}
        >
          <option value="">None</option>
          <option value="1px">1px</option>
          <option value="2px">2px</option>
          <option value="4px">4px</option>
        </select>
      </label>
      <label>
        Opacity
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          disabled={!canEdit}
          value={style?.opacity ?? 1}
          onChange={(e) => patch({ opacity: Number(e.target.value) })}
        />
        <span className="vs-tool-hint">{Math.round((style?.opacity ?? 1) * 100)}%</span>
      </label>
    </div>
  );
}

export function OpsWatchImageTool({ bridge }: { bridge: OpsWatchEditorBridge | null }) {
  const editor = useStyleEditor(bridge);
  if (!bridge || !editor) return <p className="vs-tool-hint">Connect the editor bridge.</p>;
  const host = bridge;
  const { page, selection, canEdit, applyPage, style, patch } = editor;
  const isHero = selection.kind === 'heroImage';
  const isSection = selection.kind === 'sectionImage';
  if (!isHero && !isSection) {
    return (
      <p className="vs-tool-hint">Select a hero or section image on the canvas or in Layers.</p>
    );
  }

  const sid = sectionIdFromSelection(selection);
  const image: MarketingImage | undefined = isHero
    ? page.hero.image
    : page.sections.find((s) => s.id === sid)?.image;

  function setImage(next: MarketingImage) {
    if (isHero) {
      applyPage((p) => ({ ...p, hero: { ...p.hero, image: next } }));
      return;
    }
    if (!sid) return;
    applyPage((p) => ({
      ...p,
      sections: p.sections.map((s) => (s.id === sid ? { ...s, image: next } : s)),
    }));
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (isHero) void host.attachImage('hero', file);
    else if (sid) void host.attachImage('section', file, sid);
  }

  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Upload keeps the original media file in storage. URL and alt save with the draft.
      </p>
      <label>
        Image URL
        <input
          value={image?.url ?? ''}
          disabled={!canEdit}
          onChange={(e) =>
            setImage({
              url: e.target.value,
              alt: image?.alt ?? '',
              storagePath: image?.storagePath,
              style: image?.style,
            })
          }
        />
      </label>
      <label>
        Alt text
        <input
          value={image?.alt ?? ''}
          disabled={!canEdit}
          onChange={(e) =>
            setImage({
              url: image?.url ?? '',
              alt: e.target.value,
              storagePath: image?.storagePath,
              style: image?.style,
            })
          }
        />
      </label>
      {host.canUploadMedia ? (
        <label>
          Replace / upload
          <input type="file" accept="image/*" disabled={!canEdit || host.uploading} onChange={onFile} />
        </label>
      ) : (
        <p className="vs-tool-hint">Media upload permission is required for file replacement.</p>
      )}
      {host.uploading ? <p className="vs-tool-hint">Uploading…</p> : null}
      <label>
        Fit
        <select
          value={style?.objectFit ?? ''}
          disabled={!canEdit}
          onChange={(e) =>
            patch({
              objectFit: (e.target.value || undefined) as MarketingVisualStyle['objectFit'],
            })
          }
        >
          <option value="">Default</option>
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="fill">Fill</option>
        </select>
      </label>
      <label>
        Position
        <select
          value={style?.objectPosition ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ objectPosition: e.target.value })}
        >
          <option value="">Default</option>
          <option value="center">Centre</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label>
        Max width
        <select
          value={style?.maxWidth ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ maxWidth: e.target.value })}
        >
          <option value="">Full</option>
          <option value="320px">320px</option>
          <option value="480px">480px</option>
          <option value="640px">640px</option>
          <option value="100%">100%</option>
        </select>
      </label>
    </div>
  );
}

export function OpsWatchLayoutTool({ bridge }: { bridge: OpsWatchEditorBridge | null }) {
  const editor = useStyleEditor(bridge);
  if (!editor) return <p className="vs-tool-hint">Load a page to edit layout.</p>;
  const { page, selection, canEdit, applyPage, style, patch } = editor;
  const sid = sectionIdFromSelection(selection);
  const section = sid ? page.sections.find((s) => s.id === sid) : null;

  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Spacing updates the draft canvas immediately. Column and tone presets stay within OpsWatch
        responsive-safe values.
      </p>
      {section ? (
        <>
          <label>
            Tone / background band
            <select
              value={section.tone ?? 'default'}
              disabled={!canEdit}
              onChange={(e) => {
                const tone = e.target.value as MarketingSection['tone'];
                applyPage((p) => ({
                  ...p,
                  sections: p.sections.map((s) => (s.id === section.id ? { ...s, tone } : s)),
                }));
              }}
            >
              <option value="default">Default</option>
              <option value="band">Band</option>
              <option value="soft">Soft</option>
            </select>
          </label>
          <label>
            Card columns
            <select
              value={section.columns ?? 3}
              disabled={!canEdit}
              onChange={(e) => {
                const columns = Number(e.target.value) as 2 | 3;
                applyPage((p) => ({
                  ...p,
                  sections: p.sections.map((s) => (s.id === section.id ? { ...s, columns } : s)),
                }));
              }}
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
        </>
      ) : (
        <p className="vs-tool-hint">Select a section for tone and columns, or any element for spacing.</p>
      )}
      <label>
        Padding
        <select
          value={style?.padding ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ padding: e.target.value })}
        >
          <option value="">Default</option>
          <option value="0.5rem">S</option>
          <option value="1rem">M</option>
          <option value="1.5rem">L</option>
          <option value="2.5rem">XL</option>
        </select>
      </label>
      <label>
        Margin
        <select
          value={style?.margin ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ margin: e.target.value })}
        >
          <option value="">Default</option>
          <option value="0">None</option>
          <option value="0.5rem 0">S vertical</option>
          <option value="1rem 0">M vertical</option>
          <option value="2rem auto">L centred</option>
        </select>
      </label>
      <label>
        Alignment
        <select
          value={style?.textAlign ?? ''}
          disabled={!canEdit}
          onChange={(e) =>
            patch({
              textAlign: (e.target.value || undefined) as MarketingVisualStyle['textAlign'],
            })
          }
        >
          <option value="">Inherit</option>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      {(selection.kind === 'heroCta' || selection.kind === 'sectionCta') && (
        <label>
          Button variant
          <select
            value={
              selection.kind === 'heroCta'
                ? selection.which === 'primary'
                  ? page.hero.primaryCta?.variant ?? 'primary'
                  : page.hero.secondaryCta?.variant ?? 'secondary'
                : page.sections.find((s) => s.id === sid)?.ctas?.[selection.ctaIndex]?.variant ??
                  'primary'
            }
            disabled={!canEdit}
            onChange={(e) => {
              const variant = e.target.value as MarketingCta['variant'];
              if (selection.kind === 'heroCta') {
                applyPage((p) => {
                  if (selection.which === 'primary') {
                    return {
                      ...p,
                      hero: {
                        ...p.hero,
                        primaryCta: {
                          ...(p.hero.primaryCta ?? { label: 'Primary', href: '/' }),
                          variant,
                        },
                      },
                    };
                  }
                  return {
                    ...p,
                    hero: {
                      ...p.hero,
                      secondaryCta: {
                        ...(p.hero.secondaryCta ?? { label: 'Secondary', href: '/' }),
                        variant,
                      },
                    },
                  };
                });
                return;
              }
              applyPage((p) => ({
                ...p,
                sections: p.sections.map((s) => {
                  if (s.id !== sid) return s;
                  const ctas = [...(s.ctas ?? [])];
                  const existing = ctas[selection.ctaIndex] ?? { label: 'Button', href: '/' };
                  ctas[selection.ctaIndex] = { ...existing, variant };
                  return { ...s, ctas };
                }),
              }));
            }}
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="outline">Outline</option>
            <option value="ghost">Ghost</option>
            <option value="light">Light</option>
          </select>
        </label>
      )}
    </div>
  );
}

export function OpsWatchEffectsTool({ bridge }: { bridge: OpsWatchEditorBridge | null }) {
  const editor = useStyleEditor(bridge);
  if (!editor) return <p className="vs-tool-hint">Load a page to edit effects.</p>;
  const { canEdit, style, patch, selection } = editor;
  const styleable =
    selection.kind === 'hero' ||
    selection.kind === 'section' ||
    selection.kind === 'card' ||
    selection.kind === 'heroCta' ||
    selection.kind === 'sectionCta' ||
    selection.kind === 'heroImage' ||
    selection.kind === 'sectionImage';

  if (!styleable) {
    return <p className="vs-tool-hint">Select an element to apply shadow or border radius.</p>;
  }

  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Shadows and soft transitions apply on the draft canvas. Motion respects{' '}
        <code>prefers-reduced-motion</code> in CSS. Animation presets are not enabled for OpsWatch.
      </p>
      <label>
        Shadow
        <select
          value={style?.boxShadow ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ boxShadow: e.target.value })}
        >
          {STUDIO_SHADOWS.map((s) => (
            <option key={s.label} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Corner radius
        <select
          value={style?.borderRadius ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ borderRadius: e.target.value })}
        >
          <option value="">Default</option>
          <option value="0">Square</option>
          <option value="6px">Soft</option>
          <option value="12px">Rounded</option>
          <option value="999px">Pill</option>
        </select>
      </label>
      <label>
        Transition
        <select
          value={style?.transition ?? ''}
          disabled={!canEdit}
          onChange={(e) => patch({ transition: e.target.value })}
        >
          <option value="">None</option>
          <option value="box-shadow 160ms ease, transform 160ms ease">Soft lift</option>
          <option value="opacity 200ms ease">Fade</option>
        </select>
      </label>
    </div>
  );
}
