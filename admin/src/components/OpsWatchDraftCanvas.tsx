import { useEffect, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import type { MarketingPageContent, MarketingSiteChrome } from '../lib/opswatchMarketing';
import { styleToCss } from '../lib/marketingVisualStyle';
import {
  cmsDomId,
  selectionEquals,
  type CmsSelection,
} from '../lib/opswatchCmsSelection';

type Props = {
  page: MarketingPageContent | null;
  chrome: MarketingSiteChrome | null;
  chromeMode: boolean;
  selection: CmsSelection;
  onSelect: (sel: CmsSelection) => void;
  visualMode: boolean;
  siteBase?: string;
};

function Target({
  sel,
  selection,
  onSelect,
  visualMode,
  className,
  style,
  children,
}: {
  sel: CmsSelection;
  selection: CmsSelection;
  onSelect: (sel: CmsSelection) => void;
  visualMode: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const active = selectionEquals(sel, selection);
  return (
    <div
      id={cmsDomId(sel)}
      data-cms-id={cmsDomId(sel)}
      className={`ow-draft-target${active ? ' is-selected' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      onClick={(e: MouseEvent) => {
        if (!visualMode) return;
        e.stopPropagation();
        onSelect(sel);
      }}
      role={visualMode ? 'button' : undefined}
      tabIndex={visualMode ? 0 : undefined}
      onKeyDown={
        visualMode
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onSelect(sel);
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function CommandCenterFigure() {
  return (
    <div className="ow-cc" aria-hidden="true">
      <div className="ow-cc-chrome">
        <span />
        <span />
        <span />
        <strong>Command Center</strong>
      </div>
      <div className="ow-cc-body">
        <aside>
          <div className="is-on">Dashboard</div>
          <div>Applications</div>
          <div>Incidents</div>
          <div>Topology</div>
        </aside>
        <div className="ow-cc-main">
          <div className="ow-cc-kpis">
            <div><span>Healthy</span><strong>12</strong></div>
            <div><span>Degraded</span><strong>2</strong></div>
            <div><span>Down</span><strong>1</strong></div>
            <div><span>Checks</span><strong>148</strong></div>
          </div>
          <div className="ow-cc-panels">
            <div>
              <header>Checkout API</header>
              <p>Healthy · latency steady</p>
            </div>
            <div>
              <header>Quote workflow</header>
              <p>Latency elevated</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpsWatchDraftCanvas({
  page,
  chrome,
  chromeMode,
  selection,
  onSelect,
  visualMode,
  siteBase,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = cmsDomId(selection);
    const root = scrollerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selection]);

  if (chromeMode && chrome) {
    return (
      <div className="ow-draft-canvas" ref={scrollerRef}>
        <p className="ow-draft-canvas-hint muted-sm">
          Draft chrome preview — edits update here immediately. Save draft before site Preview.
        </p>
        <Target
          sel={{ kind: 'chromeNav' }}
          selection={selection}
          onSelect={onSelect}
          visualMode={visualMode}
          className="ow-draft-chrome-nav"
        >
          <nav>
            {chrome.nav.map((link) => (
              <span key={`${link.href}-${link.label}`}>{link.label}</span>
            ))}
          </nav>
        </Target>
        <Target
          sel={{ kind: 'chromeBlurb' }}
          selection={selection}
          onSelect={onSelect}
          visualMode={visualMode}
          className="ow-draft-chrome-blurb"
        >
          <p>{chrome.productBlurb || 'Product blurb'}</p>
        </Target>
        <Target
          sel={{ kind: 'chromeFooter', which: 'company' }}
          selection={selection}
          onSelect={onSelect}
          visualMode={visualMode}
          className="ow-draft-chrome-footer"
        >
          <strong>Company</strong>
          <ul>
            {chrome.footerCompany.map((link) => (
              <li key={`${link.href}-${link.label}`}>{link.label}</li>
            ))}
          </ul>
        </Target>
        <Target
          sel={{ kind: 'chromeFooter', which: 'getStarted' }}
          selection={selection}
          onSelect={onSelect}
          visualMode={visualMode}
          className="ow-draft-chrome-footer"
        >
          <strong>Get started</strong>
          <ul>
            {chrome.footerGetStarted.map((link) => (
              <li key={`${link.href}-${link.label}`}>{link.label}</li>
            ))}
          </ul>
        </Target>
        <Target
          sel={{ kind: 'chromeFooter', which: 'note' }}
          selection={selection}
          onSelect={onSelect}
          visualMode={visualMode}
          className="ow-draft-chrome-footer"
        >
          <p>{chrome.footerNote || 'Footer note'}</p>
        </Target>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="ow-draft-canvas" ref={scrollerRef}>
        <p className="muted-sm">Loading draft…</p>
      </div>
    );
  }

  const logoSrc = siteBase ? `${siteBase}/brand/opswatch-logo-light.png` : '';
  const showCommandCenter = Boolean(page.hero.showCommandCenterPreview) && !page.hero.image?.url;

  return (
    <div className="ow-draft-canvas ow-site-canvas" ref={scrollerRef}>
      <p className="ow-draft-canvas-hint muted-sm">
        {visualMode
          ? 'Click a heading, paragraph, button or image. Changes stay in the draft until you publish.'
          : 'Structure Edit — select items from Layers. The canvas still shows the website.'}
      </p>
      <header className="ow-site-bar">
        {logoSrc ? (
          <img className="ow-site-logo" src={logoSrc} alt="OpsWatch" />
        ) : (
          <strong className="ow-site-wordmark">OpsWatch</strong>
        )}
        <nav aria-label="Site">
          {(chrome?.nav ?? []).map((item) => (
            <span key={`${item.href}-${item.label}`}>{item.label}</span>
          ))}
        </nav>
        <span className="ow-site-signin">Sign in</span>
        <span className="ow-site-start">Start monitoring</span>
      </header>

      <Target
        sel={{ kind: 'hero' }}
        selection={selection}
        onSelect={onSelect}
        visualMode={visualMode}
        className={`ow-site-hero${showCommandCenter || page.hero.image?.url ? ' is-split' : ''}`}
        style={styleToCss(page.hero.style)}
      >
        <div className="ow-site-hero-copy">
          {page.hero.eyebrow ? <p className="ow-draft-eyebrow">{page.hero.eyebrow}</p> : null}
          <h1>{page.hero.title}</h1>
          <p className="ow-draft-lead">{page.hero.subtitle}</p>
          <div className="ow-draft-cta-row">
            {page.hero.primaryCta ? (
              <Target
                sel={{ kind: 'heroCta', which: 'primary' }}
                selection={selection}
                onSelect={onSelect}
                visualMode={visualMode}
                className="ow-site-btn is-primary"
                style={styleToCss(page.hero.primaryCta.style)}
              >
                {page.hero.primaryCta.label}
              </Target>
            ) : null}
            {page.hero.secondaryCta ? (
              <Target
                sel={{ kind: 'heroCta', which: 'secondary' }}
                selection={selection}
                onSelect={onSelect}
                visualMode={visualMode}
                className="ow-site-btn is-secondary"
                style={styleToCss(page.hero.secondaryCta.style)}
              >
                {page.hero.secondaryCta.label}
              </Target>
            ) : null}
          </div>
          {(page.hero.pills ?? []).length ? (
            <div className="ow-draft-pills">
              {(page.hero.pills ?? []).map((pill) => (
                <span key={pill}>{pill}</span>
              ))}
            </div>
          ) : null}
        </div>
        {page.hero.image?.url ? (
          <Target
            sel={{ kind: 'heroImage' }}
            selection={selection}
            onSelect={onSelect}
            visualMode={visualMode}
            className="ow-draft-hero-media"
            style={styleToCss(page.hero.image.style)}
          >
            <img src={page.hero.image.url} alt={page.hero.image.alt || ''} />
          </Target>
        ) : showCommandCenter ? (
          <CommandCenterFigure />
        ) : null}
      </Target>

      {page.sections.map((section) => (
        <Target
          key={section.id}
          sel={{ kind: 'section', sectionId: section.id }}
          selection={selection}
          onSelect={onSelect}
          visualMode={visualMode}
          className={`ow-draft-section${section.tone === 'band' ? ' is-band' : ''}${section.tone === 'soft' ? ' is-soft' : ''}`}
          style={styleToCss(section.style)}
        >
          {section.eyebrow ? <p className="ow-draft-eyebrow">{section.eyebrow}</p> : null}
          {section.title ? <h2>{section.title}</h2> : null}
          {section.body ? <p>{section.body}</p> : null}

          {(section.cards ?? []).length > 0 ? (
            <div
              className="ow-draft-card-grid"
              style={
                section.columns === 2
                  ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
                  : undefined
              }
            >
              {(section.cards ?? []).map((card) => (
                <Target
                  key={card.id}
                  sel={{ kind: 'card', sectionId: section.id, cardId: card.id }}
                  selection={selection}
                  onSelect={onSelect}
                  visualMode={visualMode}
                  className="ow-draft-card"
                  style={styleToCss(card.style)}
                >
                  {card.icon ? <span className="ow-draft-card-icon">{card.icon}</span> : null}
                  <strong>{card.title}</strong>
                  <span>{card.body}</span>
                  {card.state ? <em>{card.state}</em> : null}
                </Target>
              ))}
            </div>
          ) : null}

          {section.image?.url ? (
            <Target
              sel={{ kind: 'sectionImage', sectionId: section.id }}
              selection={selection}
              onSelect={onSelect}
              visualMode={visualMode}
              className="ow-draft-section-image"
              style={styleToCss(section.image.style)}
            >
              <img src={section.image.url} alt={section.image.alt || ''} />
            </Target>
          ) : null}

          {(section.ctas ?? []).length > 0 ? (
            <div className="ow-draft-cta-row">
              {(section.ctas ?? []).map((cta, ctaIndex) => (
                <Target
                  key={`${section.id}-cta-${ctaIndex}`}
                  sel={{ kind: 'sectionCta', sectionId: section.id, ctaIndex }}
                  selection={selection}
                  onSelect={onSelect}
                  visualMode={visualMode}
                  className="ow-site-btn is-primary"
                  style={styleToCss(cta.style)}
                >
                  {cta.label}
                </Target>
              ))}
            </div>
          ) : null}
        </Target>
      ))}
    </div>
  );
}
