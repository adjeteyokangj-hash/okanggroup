import {
  BuilderNode,
  CmsBuilderDoc,
  contrastLabel,
  hasInsufficientContrast,
  isChromeNode,
  navLinksLabel,
  parseNavLinkText,
  updateNode,
  updateNodeProps,
  updateNodeStyle,
} from '../../lib/cmsBuilder';

type Props = {
  doc: CmsBuilderDoc;
  selected: BuilderNode | null;
  canEdit: boolean;
  tab: 'content' | 'design' | 'page';
  onTab: (t: 'content' | 'design' | 'page') => void;
  onChange: (doc: CmsBuilderDoc) => void;
  onRemove: (id: string) => void;
  uploading?: boolean;
  onImageFile?: (file: File | null) => void;
};

export function BuilderStyleInspector({
  doc,
  selected,
  canEdit,
  tab,
  onTab,
  onChange,
  onRemove,
  uploading,
  onImageFile,
}: Props) {
  const tokens = doc.tokens;
  const pageFg = tokens.text ?? '#1a1a1a';
  const pageBg = tokens.pageBackground ?? '#f7f4ef';
  const pageContrastBad = hasInsufficientContrast(pageFg, pageBg);
  const blockFg = selected?.style?.color || pageFg;
  const blockBg =
    selected?.style?.cardColor || selected?.style?.backgroundColor || pageBg;
  const blockContrastBad = Boolean(selected && hasInsufficientContrast(blockFg, blockBg));

  return (
    <div className="cms-builder-inspector">
      <div className="cms-rail-tabs">
        {(['content', 'design', 'page'] as const).map((t) => (
          <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => onTab(t)}>
            {t === 'page' ? 'Page' : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'page' ? (
        <div className="cms-props">
          <p className="muted-sm">Page-level colours apply behind every section.</p>
          {pageContrastBad ? (
            <div className="cms-contrast-warn" role="status">
              Low contrast between page text and background ({contrastLabel(pageFg, pageBg)}). Aim for
              at least 4.5:1 so mobile preview stays readable.
            </div>
          ) : null}
          <div className="cms-color-row">
            <label>
              Page background
              <input
                type="color"
                disabled={!canEdit}
                value={tokens.pageBackground ?? '#f7f4ef'}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    tokens: { ...tokens, pageBackground: e.target.value },
                    brand: { ...doc.brand, backgroundColor: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Default card colour
              <input
                type="color"
                disabled={!canEdit}
                value={tokens.cardSurface ?? '#ffffff'}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    tokens: { ...tokens, cardSurface: e.target.value },
                  })
                }
              />
            </label>
          </div>
          <div className="cms-color-row">
            <label>
              Surface
              <input
                type="color"
                disabled={!canEdit}
                value={tokens.surface ?? '#ffffff'}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    tokens: { ...tokens, surface: e.target.value },
                    brand: { ...doc.brand, surfaceColor: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Text
              <input
                type="color"
                disabled={!canEdit}
                value={tokens.text ?? '#1a1a1a'}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    tokens: { ...tokens, text: e.target.value },
                    brand: { ...doc.brand, textColor: e.target.value },
                  })
                }
              />
            </label>
          </div>
          <div className="cms-color-row">
            <label>
              Primary
              <input
                type="color"
                disabled={!canEdit}
                value={tokens.primary ?? '#0b3d2e'}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    tokens: { ...tokens, primary: e.target.value },
                    brand: { ...doc.brand, primaryColor: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Accent
              <input
                type="color"
                disabled={!canEdit}
                value={tokens.accent ?? '#c4a35a'}
                onChange={(e) =>
                  onChange({
                    ...doc,
                    tokens: { ...tokens, accent: e.target.value },
                    brand: { ...doc.brand, accentColor: e.target.value },
                  })
                }
              />
            </label>
          </div>
          <label>
            Navigation links
            <input
              disabled={!canEdit}
              value={navLinksLabel(doc.navigation.links)}
              onChange={(e) =>
                onChange({
                  ...doc,
                  navigation: {
                    ...doc.navigation,
                    links: parseNavLinkText(e.target.value),
                    mobileMenu: 'hamburger',
                  },
                })
              }
              placeholder="Home · About · Contact"
            />
          </label>
          <p className="muted-sm">Separate with · or commas. On mobile, links collapse into a hamburger menu.</p>
          <label>
            Collapse menu at
            <select
              disabled={!canEdit}
              value={doc.navigation.collapseAt}
              onChange={(e) =>
                onChange({
                  ...doc,
                  navigation: {
                    ...doc.navigation,
                    collapseAt: e.target.value === 'tablet' ? 'tablet' : 'mobile',
                    mobileMenu: 'hamburger',
                  },
                })
              }
            >
              <option value="mobile">Mobile only</option>
              <option value="tablet">Tablet and mobile</option>
            </select>
          </label>
        </div>
      ) : !selected || !canEdit ? (
        <p className="muted-sm cms-props-empty">Select a block on the canvas to edit it.</p>
      ) : tab === 'content' ? (
        <div className="cms-props">
          <div className="cms-props-type">{selected.type}</div>
          <label>
            Name
            <input
              value={selected.name}
              onChange={(e) => onChange(updateNode(doc, selected.id, { name: e.target.value }))}
            />
          </label>
          {['heading', 'text', 'button', 'embed'].includes(selected.type) ? (
            <label>
              {selected.type === 'button' ? 'Label' : 'Text'}
              <textarea
                rows={selected.type === 'text' ? 5 : 2}
                value={selected.props?.text ?? ''}
                onChange={(e) => onChange(updateNodeProps(doc, selected.id, { text: e.target.value }))}
              />
            </label>
          ) : null}
          {selected.type === 'button' ? (
            <label>
              Link
              <input
                value={selected.props?.href ?? ''}
                onChange={(e) => onChange(updateNodeProps(doc, selected.id, { href: e.target.value }))}
              />
            </label>
          ) : null}
          {selected.type === 'image' ? (
            <>
              <label>
                Image alt
                <input
                  value={selected.props?.imageAlt ?? ''}
                  onChange={(e) => onChange(updateNodeProps(doc, selected.id, { imageAlt: e.target.value }))}
                />
              </label>
              <label className="file-upload">
                Upload / replace image
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    onImageFile?.(f);
                  }}
                />
              </label>
            </>
          ) : null}
          <div className="cms-props-danger actions">
            <button
              type="button"
              className="secondary"
              disabled={Boolean(selected.locked)}
              onClick={() => onRemove(selected.id)}
            >
              Remove block
            </button>
          </div>
        </div>
      ) : (
        <div className="cms-props">
          {isChromeNode(selected) ? (
            <p className="muted-sm">Header, navigation and footer stay fixed and cannot be reordered.</p>
          ) : null}

          <label>
            Layout
            <select
              value={selected.style?.display ?? 'flex'}
              onChange={(e) =>
                onChange(
                  updateNodeStyle(doc, selected.id, {
                    display: e.target.value as 'block' | 'flex' | 'grid',
                  }),
                )
              }
            >
              <option value="block">Block</option>
              <option value="flex">Flex / Stack</option>
              <option value="grid">Grid</option>
            </select>
          </label>

          {(selected.style?.display ?? 'flex') !== 'block' ? (
            <>
              <label>
                Direction
                <select
                  value={selected.style?.direction ?? 'column'}
                  onChange={(e) =>
                    onChange(
                      updateNodeStyle(doc, selected.id, {
                        direction: e.target.value as 'row' | 'column',
                      }),
                    )
                  }
                >
                  <option value="column">Vertical</option>
                  <option value="row">Horizontal</option>
                </select>
              </label>
              <label>
                Gap
                <input
                  value={selected.style?.gap ?? ''}
                  placeholder="0.75rem"
                  onChange={(e) => onChange(updateNodeStyle(doc, selected.id, { gap: e.target.value }))}
                />
              </label>
              <label>
                Align
                <select
                  value={selected.style?.align ?? 'stretch'}
                  onChange={(e) =>
                    onChange(
                      updateNodeStyle(doc, selected.id, {
                        align: e.target.value as 'start' | 'center' | 'end' | 'stretch',
                      }),
                    )
                  }
                >
                  <option value="start">Start</option>
                  <option value="center">Center</option>
                  <option value="end">End</option>
                  <option value="stretch">Stretch</option>
                </select>
              </label>
            </>
          ) : null}

          {(selected.style?.display === 'grid' || selected.type === 'grid') && (
            <label>
              Columns
              <select
                value={String(selected.style?.gridColumns ?? 3)}
                onChange={(e) =>
                  onChange(
                    updateNodeStyle(doc, selected.id, {
                      display: 'grid',
                      gridColumns: Number(e.target.value) as 2 | 3 | 4,
                    }),
                  )
                }
              >
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </label>
          )}

          <label>
            Padding
            <input
              value={selected.style?.padding ?? ''}
              placeholder="1.5rem"
              onChange={(e) => onChange(updateNodeStyle(doc, selected.id, { padding: e.target.value }))}
            />
          </label>

          {blockContrastBad ? (
            <div className="cms-contrast-warn" role="status">
              Low contrast on this block ({contrastLabel(blockFg, blockBg)}). Increase difference between
              text and background for mobile readability.
            </div>
          ) : null}
          <div className="cms-color-row">
            <label>
              Block background
              <input
                type="color"
                value={selected.style?.backgroundColor || tokens.pageBackground || '#f7f4ef'}
                onChange={(e) => onChange(updateNodeStyle(doc, selected.id, { backgroundColor: e.target.value }))}
              />
            </label>
            <label>
              Text
              <input
                type="color"
                value={selected.style?.color || tokens.text || '#1a1a1a'}
                onChange={(e) => onChange(updateNodeStyle(doc, selected.id, { color: e.target.value }))}
              />
            </label>
          </div>

          {(selected.type === 'card' || selected.type === 'grid' || selected.type === 'frame') && (
            <label>
              Card face colour
              <input
                type="color"
                value={selected.style?.cardColor || tokens.cardSurface || '#ffffff'}
                onChange={(e) =>
                  onChange(
                    updateNodeStyle(doc, selected.id, {
                      cardColor: e.target.value,
                      ...(selected.type === 'card' ? { backgroundColor: e.target.value } : {}),
                    }),
                  )
                }
              />
            </label>
          )}

          <label>
            Corner radius
            <input
              value={selected.style?.borderRadius ?? ''}
              placeholder="14px"
              onChange={(e) => onChange(updateNodeStyle(doc, selected.id, { borderRadius: e.target.value }))}
            />
          </label>
          <label>
            Shadow
            <input
              value={selected.style?.boxShadow ?? ''}
              placeholder="0 8px 24px rgba(0,0,0,0.08)"
              onChange={(e) => onChange(updateNodeStyle(doc, selected.id, { boxShadow: e.target.value }))}
            />
          </label>
          <label>
            Font size
            <input
              value={selected.style?.fontSize ?? ''}
              placeholder="1rem"
              onChange={(e) => onChange(updateNodeStyle(doc, selected.id, { fontSize: e.target.value }))}
            />
          </label>
          <label>
            Font weight
            <select
              value={selected.style?.fontWeight ?? ''}
              onChange={(e) => onChange(updateNodeStyle(doc, selected.id, { fontWeight: e.target.value }))}
            >
              <option value="">Default</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
            </select>
          </label>
          <label>
            Text align
            <select
              value={selected.style?.textAlign ?? 'left'}
              onChange={(e) =>
                onChange(
                  updateNodeStyle(doc, selected.id, {
                    textAlign: e.target.value as 'left' | 'center' | 'right',
                  }),
                )
              }
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>

          {!isChromeNode(selected) ? (
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(selected.locked)}
                onChange={(e) => onChange(updateNode(doc, selected.id, { locked: e.target.checked }))}
              />
              Lock block (blocks move and remove)
            </label>
          ) : null}
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(selected.hidden)}
              onChange={(e) => onChange(updateNode(doc, selected.id, { hidden: e.target.checked }))}
            />
            Hide on canvas
          </label>
          <div className="cms-props-danger actions">
            <button
              type="button"
              className="secondary"
              disabled={Boolean(selected.locked)}
              onClick={() => onRemove(selected.id)}
            >
              Remove block
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
