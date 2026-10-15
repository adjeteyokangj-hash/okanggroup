import { useEffect, useState, type DragEvent, type SyntheticEvent } from 'react';
import {
  BuilderInteraction,
  BuilderNavLink,
  BuilderNode,
  CmsBuilderDoc,
  isChromeNode,
  navCollapsedForViewport,
  pageCssVars,
  parseNavLinkText,
  resolveNodeStyle,
  type EditorViewport,
} from '../../lib/cmsBuilder';

type Props = {
  doc: CmsBuilderDoc;
  selectedId: string | null;
  urlMap: Record<string, string>;
  canEdit: boolean;
  viewport?: EditorViewport;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
  onSelect: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
  onDropBefore: (dragId: string, beforeId: string) => void;
  onNestInto: (dragId: string, parentId: string) => void;
};

function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

function BurgerIcon() {
  return (
    <span className="cms-nav-burger-lines" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

function SiteNavBar({
  brand,
  links,
  logoUrl,
  logoAlt,
  collapsed,
  open,
  onToggle,
  onSelectChrome,
  selected,
}: {
  brand: string;
  links: BuilderNavLink[];
  logoUrl?: string;
  logoAlt?: string;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  onSelectChrome?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      className={`cms-site-nav ${collapsed ? 'is-collapsed' : ''} ${open ? 'is-open' : ''} ${selected ? 'is-selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelectChrome?.();
      }}
      role="presentation"
    >
      <div className="cms-site-nav-top">
        <div className="cms-preview-brand">
          {logoUrl ? <img className="cms-preview-logo" src={logoUrl} alt={logoAlt || ''} /> : null}
          <strong style={{ fontFamily: 'var(--cms-heading-font, inherit)' }}>{brand}</strong>
        </div>
        {!collapsed ? (
          <nav className="cms-site-nav-links" aria-label="Primary">
            {links.map((l) => (
              <span key={l.label + l.href}>{l.label}</span>
            ))}
          </nav>
        ) : (
          <button
            type="button"
            className="cms-nav-burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onMouseDown={stop}
          >
            <BurgerIcon />
          </button>
        )}
      </div>
      {collapsed && open ? (
        <nav
          className="cms-nav-drawer"
          aria-label="Mobile"
          onClick={stop}
          onMouseDown={stop}
        >
          {links.map((l) => (
            <a
              key={l.label + l.href}
              href={l.href}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {l.label}
            </a>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function linksFromChromeNode(node: BuilderNode, fallback: BuilderNavLink[]): BuilderNavLink[] {
  const texts = (node.children ?? [])
    .filter((c) => c.type === 'text' || c.type === 'heading')
    .map((c) => c.props?.text || '')
    .filter(Boolean);
  // Prefer a child that looks like a link list (contains separators)
  const linkish = texts.find((t) => /[·|•,;/]/.test(t) || /\b(Home|About|Contact|Services)\b/i.test(t));
  if (linkish && (/[·|•,;/]/.test(linkish) || linkish.split(/\s+/).length <= 6)) {
    // If it's a single word brand-like heading without separators, skip
    if (/[·|•,;/]/.test(linkish)) return parseNavLinkText(linkish);
  }
  for (const t of texts) {
    if (/[·|•,;/]/.test(t)) return parseNavLinkText(t);
  }
  return fallback;
}

function brandFromChromeNode(node: BuilderNode, fallback: string): string {
  const heading = (node.children ?? []).find((c) => c.type === 'heading');
  if (heading?.props?.text) return heading.props.text;
  const firstText = (node.children ?? []).find((c) => c.type === 'text' && !/[·|•,;/]/.test(c.props?.text || ''));
  if (firstText?.props?.text) return firstText.props.text;
  return fallback;
}

function interactionClasses(interactions: BuilderInteraction[] | undefined, nodeId: string) {
  const mine = (interactions ?? []).filter((i) => i.targetId === nodeId);
  const classes: string[] = [];
  for (const i of mine) {
    classes.push(`cms-ix-${i.trigger}-${i.action}`);
  }
  return classes;
}

function NodeView({
  node,
  selectedId,
  urlMap,
  canEdit,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDropBefore,
  onNestInto,
  tokens,
  viewport,
  navLinks,
  navCollapseAt,
  siteName,
  mobileNavOpen,
  onMobileNavToggle,
  interactions,
}: {
  node: BuilderNode;
  selectedId: string | null;
  urlMap: Record<string, string>;
  canEdit: boolean;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
  onSelect: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
  onDropBefore: (dragId: string, beforeId: string) => void;
  onNestInto: (dragId: string, parentId: string) => void;
  tokens: CmsBuilderDoc['tokens'];
  viewport: EditorViewport;
  navLinks: BuilderNavLink[];
  navCollapseAt: 'mobile' | 'tablet';
  siteName: string;
  mobileNavOpen: string | null;
  onMobileNavToggle: (nodeId: string) => void;
  interactions: BuilderInteraction[];
}) {
  const ixClasses = interactionClasses(interactions, node.id);
  const hasScrollFade = ixClasses.includes('cms-ix-scroll-fade');
  const [inView, setInView] = useState(!hasScrollFade);

  useEffect(() => {
    if (node.hidden || !hasScrollFade) {
      setInView(true);
      return;
    }
    setInView(false);
    const el = document.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setInView(true);
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasScrollFade, node.hidden, node.id]);

  if (node.hidden) return null;
  const selected = node.id === selectedId;
  const chrome = isChromeNode(node);
  const movable = canEdit && !chrome && !node.locked;
  const nestable = ['frame', 'stack', 'grid', 'card', 'form'].includes(node.type);
  const style = resolveNodeStyle(node.style, tokens);
  const collapsed =
    (node.type === 'header' || node.type === 'nav') &&
    navCollapsedForViewport(viewport, {
      links: navLinks,
      mobileMenu: 'hamburger',
      collapseAt: navCollapseAt,
    });

  if (node.type === 'card' && !style.background) {
    style.background = tokens.cardSurface || '#fff';
  }

  function onDragStart(e: DragEvent) {
    if (!movable) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/cms-node-id', node.id);
    e.dataTransfer.effectAllowed = 'move';
    (e.currentTarget as HTMLElement).classList.add('is-dragging');
  }

  function onDragEnd(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('is-dragging');
  }

  function onDragOver(e: DragEvent) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    (e.currentTarget as HTMLElement).classList.add('is-drop-target');
  }

  function onDragLeave(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('is-drop-target');
  }

  function onDrop(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('is-drop-target');
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const dragId = e.dataTransfer.getData('text/cms-node-id');
    if (!dragId || dragId === node.id) return;
    if (e.altKey && nestable) onNestInto(dragId, node.id);
    else if (!chrome) onDropBefore(dragId, node.id);
  }

  const className = [
    'cms-bnode',
    `type-${node.type}`,
    selected ? 'selected' : '',
    chrome ? 'is-chrome' : '',
    node.locked ? 'locked' : '',
    collapsed ? 'is-nav-collapsed' : '',
    ...ixClasses,
    hasScrollFade && inView ? 'cms-ix-in-view' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const chromeLinks = linksFromChromeNode(node, navLinks);
  const chromeBrand = brandFromChromeNode(node, siteName);

  return (
    <div
      className={className}
      style={style}
      data-node-id={node.id}
      data-node-type={node.type}
      draggable={movable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      {selected ? <div className="cms-sec-pin">Editing</div> : null}
      {chrome ? <div className="cms-chrome-badge">Fixed</div> : null}
      {canEdit ? (
        <div className="cms-sec-toolbar" onClick={stop} onMouseDown={stop}>
          {chrome ? (
            <span className="cms-sec-toolbar-note">Fixed</span>
          ) : (
            <>
              <button type="button" title="Move up" disabled={!canMoveUp(node.id)} onClick={() => onMoveUp(node.id)}>
                ↑
              </button>
              <button
                type="button"
                title="Move down"
                disabled={!canMoveDown(node.id)}
                onClick={() => onMoveDown(node.id)}
              >
                ↓
              </button>
              <span className="cms-sec-drag-hint" title="Drag to reorder · Alt+drop to nest">
                ⋮⋮
              </span>
            </>
          )}
          <button
            type="button"
            className="cms-sec-remove"
            title={node.locked ? 'Unlock to remove' : 'Remove'}
            disabled={Boolean(node.locked)}
            onClick={() => onRemove(node.id)}
          >
            ×
          </button>
        </div>
      ) : null}

      {collapsed ? (
        <SiteNavBar
          brand={chromeBrand}
          links={chromeLinks}
          collapsed
          open={mobileNavOpen === node.id}
          onToggle={() => onMobileNavToggle(node.id)}
          onSelectChrome={() => onSelect(node.id)}
          selected={selected}
        />
      ) : (
        <>
          {node.type === 'heading' || node.type === 'text' ? (
            node.type === 'heading' ? (
              <h2
                className="cms-bnode-heading"
                style={{
                  margin: 0,
                  fontFamily: 'var(--cms-heading-font, inherit)',
                  color: node.style?.color || 'inherit',
                }}
              >
                {node.props?.text || 'Heading'}
              </h2>
            ) : (
              <p className="cms-bnode-text" style={{ margin: 0, color: node.style?.color || 'inherit' }}>
                {node.props?.text || 'Text'}
              </p>
            )
          ) : null}

          {node.type === 'button' ? (
            <a
              className="cms-btn"
              href={node.props?.href || '#'}
              onClick={(e) => e.preventDefault()}
              style={{
                display: 'inline-flex',
                background: node.style?.backgroundColor || 'var(--cms-primary)',
                color: node.style?.color || '#fff',
                padding: node.style?.padding || '0.7rem 1.2rem',
                borderRadius: node.style?.borderRadius || '10px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {node.props?.text || 'Button'}
            </a>
          ) : null}

          {node.type === 'image' ? (
            node.props?.imagePath && urlMap[node.props.imagePath] ? (
              <img
                src={urlMap[node.props.imagePath]}
                alt={node.props.imageAlt || ''}
                style={{
                  width: '100%',
                  display: 'block',
                  borderRadius: node.style?.borderRadius,
                  objectFit: (node.style?.objectFit as 'cover' | 'contain' | 'fill' | undefined) || 'cover',
                  maxWidth: node.style?.maxWidth || undefined,
                }}
              />
            ) : (
              <div className="cms-media-ph">Image</div>
            )
          ) : null}

          {node.type === 'spacer' ? <div aria-hidden style={{ minHeight: node.style?.minHeight || '2rem' }} /> : null}

          {node.type === 'embed' ? (
            <div className="cms-media-ph">{node.props?.text || 'Embed'}</div>
          ) : null}

          {node.children?.map((child) => (
            <NodeView
              key={child.id}
              node={child}
              selectedId={selectedId}
              urlMap={urlMap}
              canEdit={canEdit}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onSelect={onSelect}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onRemove={onRemove}
              onDropBefore={onDropBefore}
              onNestInto={onNestInto}
              tokens={tokens}
              viewport={viewport}
              navLinks={navLinks}
              navCollapseAt={navCollapseAt}
              siteName={siteName}
              mobileNavOpen={mobileNavOpen}
              onMobileNavToggle={onMobileNavToggle}
              interactions={interactions}
            />
          ))}
        </>
      )}
    </div>
  );
}

export function BuilderRenderer({
  doc,
  selectedId,
  urlMap,
  canEdit,
  viewport = 'desktop',
  canMoveUp,
  canMoveDown,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDropBefore,
  onNestInto,
}: Props) {
  const vars = pageCssVars(doc.brand, doc.tokens);
  const nav = doc.navigation;
  const collapsed = navCollapsedForViewport(viewport, nav);
  const [siteNavOpen, setSiteNavOpen] = useState(false);
  const [chromeNavOpen, setChromeNavOpen] = useState<string | null>(null);
  const hasTreeChrome = doc.tree.some((n) => n.type === 'header' || n.type === 'nav');

  useEffect(() => {
    setSiteNavOpen(false);
    setChromeNavOpen(null);
  }, [viewport]);

  return (
    <div
      className={`cms-builder-page is-vp-${viewport} ${collapsed ? 'nav-is-collapsed' : ''}`}
      style={{
        ...vars,
        ['--cms-heading-font' as string]: doc.brand.headingFont || 'inherit',
        minHeight: 520,
        width: '100%',
      }}
      onClick={() => {
        onSelect('');
        setSiteNavOpen(false);
        setChromeNavOpen(null);
      }}
      data-nav-collapse-at={nav.collapseAt}
      data-mobile-bp={doc.breakpoints.mobile}
    >
      {!hasTreeChrome ? (
        <header className="cms-preview-nav" style={{ background: 'var(--cms-primary)', color: '#fff' }}>
          <SiteNavBar
            brand={doc.brand.siteName || 'Website'}
            links={nav.links}
            logoUrl={doc.brand.logoPath && urlMap[doc.brand.logoPath] ? urlMap[doc.brand.logoPath] : undefined}
            logoAlt={doc.brand.logoAlt || ''}
            collapsed={collapsed}
            open={siteNavOpen}
            onToggle={() => setSiteNavOpen((v) => !v)}
          />
        </header>
      ) : null}

      {doc.tree.length === 0 ? (
        <div className="cms-empty-canvas">
          <p>Empty canvas</p>
          <span>Add a Hero, Stack, or Cards block from the library.</span>
        </div>
      ) : (
        doc.tree.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            selectedId={selectedId}
            urlMap={urlMap}
            canEdit={canEdit}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onSelect={onSelect}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onRemove={onRemove}
            onDropBefore={onDropBefore}
            onNestInto={onNestInto}
            tokens={doc.tokens}
            viewport={viewport}
            navLinks={nav.links}
            navCollapseAt={nav.collapseAt}
            siteName={doc.brand.siteName || 'Website'}
            mobileNavOpen={chromeNavOpen}
            onMobileNavToggle={(id) => setChromeNavOpen((cur) => (cur === id ? null : id))}
            interactions={doc.interactions ?? []}
          />
        ))
      )}
    </div>
  );
}
