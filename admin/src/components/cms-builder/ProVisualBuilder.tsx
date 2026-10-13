import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import {
  cmsEditorLayoutKey,
  clampRailWidth,
  loadCmsEditorLayout,
  saveCmsEditorLayout,
} from '../../lib/cmsEditorLayout';
import {
  BUILDER_LIBRARY,
  BuilderLibraryItem,
  CmsBuilderDoc,
  canReorderSibling,
  createLibraryNode,
  findNode,
  flattenNodes,
  insertRootNode,
  isChromeNode,
  moveNodeBefore,
  nestInto,
  normalizeBuilderDoc,
  removeNode,
  reorderSibling,
  responsiveNavCss,
  updateNodeProps,
} from '../../lib/cmsBuilder';
import { signedCmsMediaUrl, uploadClientCmsImage } from '../../lib/files';
import { BuilderLayers } from './BuilderLayers';
import { BuilderRenderer } from './BuilderRenderer';
import { BuilderStyleInspector } from './BuilderStyleInspector';

type Viewport = 'desktop' | 'tablet' | 'mobile';
type LeftTab = 'components' | 'layers' | 'brand';
type RightTab = 'content' | 'design' | 'page';

type Props = {
  clientId: string;
  instanceId: string;
  documentKey?: string | null;
  siteName: string;
  title: string;
  slug: string;
  bodyJson: unknown;
  canEdit: boolean;
  busy?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onTitleChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onBodyChange: (body: CmsBuilderDoc) => void;
  onSaveDraft: () => void;
  workflowActions?: React.ReactNode;
};

const VIEWPORT_WIDTH: Record<Viewport, number | string> = {
  desktop: '100%',
  tablet: 768,
  mobile: 390,
};

const MOBILE_PRESETS = [320, 375, 390, 430] as const;

const CATEGORY_LABEL: Record<BuilderLibraryItem['category'], string> = {
  layout: 'Layout',
  content: 'Content',
  media: 'Media',
  convert: 'Convert',
  structure: 'Structure',
};

export function ProVisualBuilder({
  clientId,
  instanceId,
  documentKey,
  siteName,
  title,
  slug,
  bodyJson,
  canEdit,
  busy,
  expanded = false,
  onExpandedChange,
  onTitleChange,
  onSlugChange,
  onBodyChange,
  onSaveDraft,
  workflowActions,
}: Props) {
  const { user } = useAuth();
  const layoutKey = cmsEditorLayoutKey(user?.id, instanceId);
  const initialLayout = useRef(loadCmsEditorLayout(layoutKey));

  const [doc, setDoc] = useState<CmsBuilderDoc>(() => normalizeBuilderDoc(bodyJson, siteName));
  const [selectedId, setSelectedId] = useState<string | null>(() => doc.tree[0]?.id ?? null);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [mobileWidth, setMobileWidth] = useState<number>(390);
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [leftOpen, setLeftOpen] = useState(initialLayout.current.leftOpen);
  const [rightOpen, setRightOpen] = useState(initialLayout.current.rightOpen);
  const [leftWidth, setLeftWidth] = useState(initialLayout.current.leftWidth);
  const [rightWidth, setRightWidth] = useState(initialLayout.current.rightWidth);
  const [history, setHistory] = useState<CmsBuilderDoc[]>([]);
  const [future, setFuture] = useState<CmsBuilderDoc[]>([]);
  const [dirty, setDirty] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>('components');
  const [rightTab, setRightTab] = useState<RightTab>('content');
  const [compFilter, setCompFilter] = useState<BuilderLibraryItem['category'] | 'all'>('all');
  const [previewOnly, setPreviewOnly] = useState(false);
  const panelSnapshot = useRef<{ left: boolean; right: boolean } | null>(null);
  const resizing = useRef<'left' | 'right' | null>(null);

  const selected = selectedId ? findNode(doc.tree, selectedId) : null;
  const showLeft = leftOpen && !previewOnly;
  const showRight = rightOpen && !previewOnly;
  const frameWidth = viewport === 'mobile' ? mobileWidth : VIEWPORT_WIDTH[viewport];

  const library = useMemo(
    () =>
      BUILDER_LIBRARY.filter((c) => (compFilter === 'all' ? true : c.category === compFilter)),
    [compFilter],
  );

  function commit(next: CmsBuilderDoc, pushHistory = true) {
    const stamped = { ...next, navigationCss: responsiveNavCss(next) };
    if (pushHistory) {
      setHistory((h) => [...h.slice(-39), doc]);
      setFuture([]);
    }
    setDoc(stamped);
    setDirty(true);
    onBodyChange(stamped);
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [doc, ...f]);
      setDoc(prev);
      onBodyChange(prev);
      return h.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (!f.length) return f;
      const [next, ...rest] = f;
      setHistory((h) => [...h, doc]);
      setDoc(next);
      onBodyChange(next);
      return rest;
    });
  }

  useEffect(() => {
    const next = normalizeBuilderDoc(bodyJson, siteName);
    setDoc(next);
    setHistory([]);
    setFuture([]);
    setDirty(false);
    setSelectedId(next.tree[0]?.id ?? null);
    setPreviewOnly(false);
    setLeftOpen(true);
    setRightOpen(true);
  }, [documentKey, siteName]);

  useEffect(() => {
    saveCmsEditorLayout(layoutKey, { leftOpen, rightOpen, leftWidth, rightWidth });
  }, [layoutKey, leftOpen, rightOpen, leftWidth, rightWidth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewOnly) {
          e.preventDefault();
          const snap = panelSnapshot.current;
          setPreviewOnly(false);
          setLeftOpen(snap?.left ?? true);
          setRightOpen(snap?.right ?? true);
          panelSnapshot.current = null;
          return;
        }
        if (expanded) {
          e.preventDefault();
          onExpandedChange?.(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, previewOnly, onExpandedChange]);

  useEffect(() => {
    const paths = new Set<string>();
    if (doc.brand.logoPath) paths.add(doc.brand.logoPath);
    if (doc.brand.appIconPath) paths.add(doc.brand.appIconPath);
    for (const { node } of flattenNodes(doc.tree)) {
      if (node.props?.imagePath) paths.add(node.props.imagePath);
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        [...paths].map(async (p) => {
          try {
            next[p] = await signedCmsMediaUrl(p);
          } catch {
            /* ignore */
          }
        }),
      );
      if (!cancelled) setUrlMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    if (!canEdit || !dirty) return;
    const t = window.setTimeout(() => {
      onSaveDraft();
      setDirty(false);
    }, 12000);
    return () => window.clearTimeout(t);
  }, [doc, title, slug, canEdit, dirty, onSaveDraft]);

  function startResize(side: 'left' | 'right') {
    resizing.current = side;
    const onMove = (e: MouseEvent) => {
      if (resizing.current === 'left') {
        setLeftWidth(clampRailWidth(e.clientX - 16));
      } else if (resizing.current === 'right') {
        const fromRight = window.innerWidth - e.clientX - 16;
        setRightWidth(clampRailWidth(fromRight));
      }
    };
    const onUp = () => {
      resizing.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function openBrandPanel() {
    setPreviewOnly(false);
    setLeftOpen(true);
    setLeftTab('brand');
  }

  function enterPreviewOnly() {
    if (previewOnly) return;
    panelSnapshot.current = { left: leftOpen, right: rightOpen };
    setLeftOpen(false);
    setRightOpen(false);
    setPreviewOnly(true);
  }

  function exitPreviewOnly() {
    const snap = panelSnapshot.current;
    setPreviewOnly(false);
    setLeftOpen(snap?.left ?? true);
    setRightOpen(snap?.right ?? true);
    panelSnapshot.current = null;
  }

  function resetEditorLayout() {
    setPreviewOnly(false);
    setLeftOpen(true);
    setRightOpen(true);
    setLeftWidth(280);
    setRightWidth(300);
    panelSnapshot.current = null;
  }

  function addBlock(type: BuilderLibraryItem['type']) {
    const node = createLibraryNode(type);
    commit(insertRootNode(doc, node));
    setSelectedId(node.id);
    setRightTab('content');
    setRightOpen(true);
  }

  function move(id: string, dir: -1 | 1) {
    const node = findNode(doc.tree, id);
    if (!node) return;
    if (isChromeNode(node)) {
      setError('Header, navigation and footer stay fixed and cannot be moved.');
      return;
    }
    if (node.locked) {
      setError('This block is locked. Unlock it before moving.');
      return;
    }
    const next = reorderSibling(doc, id, dir);
    if (!next) return;
    commit(next);
    setError(null);
  }

  function dropBefore(dragId: string, beforeId: string) {
    const next = moveNodeBefore(doc, dragId, beforeId);
    if (!next) return;
    commit(next);
    setSelectedId(dragId);
    setError(null);
  }

  function nest(dragId: string, parentId: string) {
    const next = nestInto(doc, dragId, parentId);
    if (!next) return;
    commit(next);
    setSelectedId(dragId);
    setError(null);
  }

  function remove(id: string) {
    const node = findNode(doc.tree, id);
    if (!node) return;
    if (node.locked) {
      setError('This block is locked. Unlock it in Design before removing.');
      return;
    }
    const next = removeNode(doc, id);
    commit(next);
    if (selectedId === id) setSelectedId(next.tree[0]?.id ?? null);
    setError(null);
  }

  async function onImageFile(file: File | null) {
    if (!file || !user || !selected || !canEdit) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadClientCmsImage({
        clientId,
        instanceId,
        file,
        userId: user.id,
      });
      const path = uploaded.storage_path as string;
      commit(updateNodeProps(doc, selected.id, { imagePath: path }));
      setUrlMap((m) => ({ ...m, [path]: URL.createObjectURL(file) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onBrandAsset(kind: 'logo' | 'appIcon', file: File | null) {
    if (!file || !user || !canEdit) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadClientCmsImage({
        clientId,
        instanceId,
        file,
        userId: user.id,
      });
      const path = uploaded.storage_path as string;
      const brand =
        kind === 'logo'
          ? {
              ...doc.brand,
              logoPath: path,
              logoAlt: doc.brand.logoAlt || doc.brand.siteName || 'Logo',
            }
          : { ...doc.brand, appIconPath: path };
      commit({ ...doc, brand });
      setUrlMap((m) => ({ ...m, [path]: URL.createObjectURL(file) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const brandPanel = (
    <div className="cms-props cms-brand-panel">
      <label>
        Site name
        <input
          value={doc.brand.siteName ?? ''}
          disabled={!canEdit}
          onChange={(e) => commit({ ...doc, brand: { ...doc.brand, siteName: e.target.value } })}
        />
      </label>
      <div className="cms-brand-asset">
        <div className="cms-brand-asset-head">
          <strong>Company logo</strong>
          <span>Shown in the website header</span>
        </div>
        <div className="cms-brand-asset-row">
          <div className="cms-brand-thumb logo">
            {doc.brand.logoPath && urlMap[doc.brand.logoPath] ? (
              <img src={urlMap[doc.brand.logoPath]} alt={doc.brand.logoAlt || 'Logo'} />
            ) : (
              <span>No logo</span>
            )}
          </div>
          <div className="cms-brand-asset-actions">
            {canEdit ? (
              <label className="file-upload cms-brand-upload">
                Upload logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    void onBrandAsset('logo', f);
                  }}
                />
              </label>
            ) : null}
            {canEdit && doc.brand.logoPath ? (
              <button
                type="button"
                className="secondary"
                onClick={() => commit({ ...doc, brand: { ...doc.brand, logoPath: null } })}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="cms-brand-asset">
        <div className="cms-brand-asset-head">
          <strong>App icon</strong>
          <span>Favicon / app mark</span>
        </div>
        <div className="cms-brand-asset-row">
          <div className="cms-brand-thumb icon">
            {doc.brand.appIconPath && urlMap[doc.brand.appIconPath] ? (
              <img src={urlMap[doc.brand.appIconPath]} alt="App icon" />
            ) : (
              <span>No icon</span>
            )}
          </div>
          <div className="cms-brand-asset-actions">
            {canEdit ? (
              <label className="file-upload cms-brand-upload">
                Upload icon
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    void onBrandAsset('appIcon', f);
                  }}
                />
              </label>
            ) : null}
            {canEdit && doc.brand.appIconPath ? (
              <button
                type="button"
                className="secondary"
                onClick={() => commit({ ...doc, brand: { ...doc.brand, appIconPath: null } })}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <p className="muted-sm">Page and card colours are under the Page tab in the right inspector.</p>
    </div>
  );

  return (
    <div className={`visual-cms ${expanded ? 'is-expanded' : ''} ${previewOnly ? 'is-preview-only' : ''}`}>
      <div className="visual-cms-toolbar">
        <div className="visual-cms-toolbar-top">
          <div className="visual-cms-meta row-2">
            <label>
              Page title
              <input value={title} onChange={(e) => onTitleChange(e.target.value)} disabled={!canEdit} />
            </label>
            <label>
              Slug
              <input
                value={slug}
                onChange={(e) => onSlugChange(e.target.value)}
                disabled={!canEdit}
                placeholder="auto from title"
              />
            </label>
          </div>
          {onExpandedChange && expanded ? (
            <button
              type="button"
              className="cms-exit-btn"
              onClick={() => onExpandedChange(false)}
              title="Exit expanded view (Esc)"
            >
              Exit Expanded View
            </button>
          ) : null}
        </div>

        <div className="visual-cms-chrome">
          <div className="cms-seg">
            <button
              type="button"
              className={leftOpen && !previewOnly ? 'on' : ''}
              onClick={() => {
                if (previewOnly) exitPreviewOnly();
                else setLeftOpen((v) => !v);
              }}
            >
              Components
            </button>
            <button
              type="button"
              className={leftOpen && leftTab === 'brand' && !previewOnly ? 'on' : ''}
              onClick={() => {
                if (previewOnly) exitPreviewOnly();
                openBrandPanel();
              }}
            >
              Brand
            </button>
            <button
              type="button"
              className={rightOpen && !previewOnly ? 'on' : ''}
              onClick={() => {
                if (previewOnly) exitPreviewOnly();
                else setRightOpen((v) => !v);
              }}
            >
              Properties
            </button>
          </div>
          <div className="cms-seg cms-viewport-seg">
            {(['desktop', 'tablet', 'mobile'] as Viewport[]).map((v) => (
              <button key={v} type="button" className={viewport === v ? 'on' : ''} onClick={() => setViewport(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {viewport === 'mobile' ? (
            <div className="cms-seg cms-mobile-width-seg" title="Phone width">
              {MOBILE_PRESETS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={mobileWidth === w ? 'on' : ''}
                  onClick={() => setMobileWidth(w)}
                >
                  {w}
                </button>
              ))}
            </div>
          ) : null}
          <div className="cms-toolbar-spacer" />
          {!showLeft && !showRight ? (
            <button type="button" className="secondary" onClick={resetEditorLayout}>
              Show panels
            </button>
          ) : null}
          {canEdit ? (
            <div className="cms-seg">
              <button type="button" disabled={!history.length} onClick={undo}>
                Undo
              </button>
              <button type="button" disabled={!future.length} onClick={redo}>
                Redo
              </button>
            </div>
          ) : null}
          {canEdit ? (
            <button type="button" className="cms-primary-action" disabled={busy || uploading} onClick={onSaveDraft}>
              Save draft{dirty ? ' ·' : ''}
            </button>
          ) : null}
          {workflowActions}
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="visual-cms-layout">
        {showLeft ? (
          <>
            <aside
              className="visual-cms-rail cms-left-rail panel"
              style={{ width: leftWidth, flex: `0 0 ${leftWidth}px` }}
            >
              <div className="cms-rail-tabs">
                <button
                  type="button"
                  className={leftTab === 'components' ? 'on' : ''}
                  onClick={() => setLeftTab('components')}
                >
                  Library
                </button>
                <button type="button" className={leftTab === 'layers' ? 'on' : ''} onClick={() => setLeftTab('layers')}>
                  Layers
                </button>
                <button type="button" className={leftTab === 'brand' ? 'on' : ''} onClick={() => setLeftTab('brand')}>
                  Brand
                </button>
              </div>

              {leftTab === 'brand' ? (
                brandPanel
              ) : leftTab === 'components' ? (
                <>
                  <div className="cms-filter-row">
                    <button
                      type="button"
                      className={compFilter === 'all' ? 'on' : ''}
                      onClick={() => setCompFilter('all')}
                    >
                      All
                    </button>
                    {(Object.keys(CATEGORY_LABEL) as BuilderLibraryItem['category'][]).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={compFilter === cat ? 'on' : ''}
                        onClick={() => setCompFilter(cat)}
                      >
                        {CATEGORY_LABEL[cat]}
                      </button>
                    ))}
                  </div>
                  <div className="cms-component-lib">
                    {library.map((c) => (
                      <button
                        key={c.type + c.label}
                        type="button"
                        className="cms-comp-tile"
                        disabled={!canEdit}
                        onClick={() => addBlock(c.type)}
                        title={c.hint}
                      >
                        <span className="cms-comp-label">{c.label}</span>
                        <span className="cms-comp-hint">{c.hint}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <BuilderLayers
                  doc={doc}
                  selectedId={selectedId}
                  canEdit={canEdit}
                  onSelect={(id) => {
                    setSelectedId(id || null);
                    setRightOpen(true);
                    setRightTab('content');
                  }}
                  onChange={commit}
                />
              )}
            </aside>
            <div
              className="visual-cms-resize"
              onMouseDown={(e) => {
                e.preventDefault();
                startResize('left');
              }}
              role="separator"
              aria-orientation="vertical"
            />
          </>
        ) : null}

        <div className={`visual-cms-preview-wrap ${previewOnly ? 'is-preview-only' : ''}`}>
          <div className="cms-canvas-chrome">
            <div className="cms-canvas-dots" aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <div className="cms-canvas-url">
              {doc.brand.appIconPath && urlMap[doc.brand.appIconPath] ? (
                <img className="cms-canvas-favicon" src={urlMap[doc.brand.appIconPath]} alt="" />
              ) : null}
              {doc.brand.siteName || siteName}
              {slug ? ` / ${slug}` : ''}
            </div>
            <div className="cms-canvas-actions">
              <span className="cms-canvas-vp">
                {viewport === 'mobile' ? `mobile · ${mobileWidth}px` : viewport}
              </span>
              {previewOnly ? (
                <button type="button" className="cms-preview-focus-btn" onClick={exitPreviewOnly}>
                  Show panels
                </button>
              ) : (
                <button
                  type="button"
                  className="cms-preview-focus-btn"
                  onClick={enterPreviewOnly}
                  title="Hide side panels"
                >
                  Focus preview
                </button>
              )}
            </div>
          </div>
          <div className={`visual-cms-preview-stage stage-${viewport}`}>
            <div
              className={`visual-cms-frame viewport-${viewport} ${viewport === 'mobile' ? 'is-phone-frame' : ''}`}
              style={{
                width: typeof frameWidth === 'number' ? `${frameWidth}px` : frameWidth,
                maxWidth: typeof frameWidth === 'number' ? `${frameWidth}px` : undefined,
              }}
            >
              <BuilderRenderer
                doc={doc}
                selectedId={selectedId}
                urlMap={urlMap}
                canEdit={canEdit}
                viewport={viewport}
                canMoveUp={(id) => canReorderSibling(doc, id, -1)}
                canMoveDown={(id) => canReorderSibling(doc, id, 1)}
                onSelect={(id) => {
                  if (!id) return;
                  setSelectedId(id);
                  setRightTab('content');
                  setRightOpen(true);
                }}
                onMoveUp={(id) => move(id, -1)}
                onMoveDown={(id) => move(id, 1)}
                onRemove={remove}
                onDropBefore={dropBefore}
                onNestInto={nest}
              />
            </div>
            {!previewOnly ? (
              <p className="cms-preview-hint">Drag blocks to reorder · Alt+drop onto a frame/stack/grid to nest</p>
            ) : (
              <p className="cms-preview-hint">Preview focus · Esc or Show panels to return</p>
            )}
          </div>
        </div>

        {showRight ? (
          <>
            <div
              className="visual-cms-resize"
              onMouseDown={(e) => {
                e.preventDefault();
                startResize('right');
              }}
              role="separator"
              aria-orientation="vertical"
            />
            <aside
              className="visual-cms-rail cms-right-rail panel"
              style={{ width: rightWidth, flex: `0 0 ${rightWidth}px` }}
            >
              <BuilderStyleInspector
                doc={doc}
                selected={selected}
                canEdit={canEdit}
                tab={rightTab}
                onTab={setRightTab}
                onChange={commit}
                onRemove={remove}
                uploading={uploading}
                onImageFile={(f) => void onImageFile(f)}
              />
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}
