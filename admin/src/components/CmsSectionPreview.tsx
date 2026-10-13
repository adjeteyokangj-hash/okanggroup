import type { CSSProperties, DragEvent, SyntheticEvent } from 'react';
import {
  CmsPageBrand,
  CmsSection,
  isChromeSection,
  parseFaqPairs,
  parseNamedItems,
  splitBodyLines,
} from '../lib/cmsPage';

export type PreviewFocusField = 'heading' | 'body' | 'button' | 'image' | null;

type Props = {
  section: CmsSection;
  brand: CmsPageBrand;
  imageUrl?: string | null;
  selected: boolean;
  focusField?: PreviewFocusField;
  canEdit?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onSelect: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  onDropBefore?: (dragId: string) => void;
};

function styleClass(section: CmsSection) {
  const s = section.style ?? {};
  return [
    `cms-sec`,
    `type-${section.type}`,
    `pad-${s.padding ?? 'lg'}`,
    `my-${s.marginY ?? 'none'}`,
    `rad-${s.borderRadius ?? 'none'}`,
    `sh-${s.shadow ?? 'none'}`,
    `align-${s.align ?? 'left'}`,
    `anim-${s.animation ?? 'none'}`,
    `hover-${s.hover ?? 'none'}`,
    `hsize-${s.headingSize ?? 'md'}`,
    `bsize-${s.bodySize ?? 'md'}`,
    `lh-${s.lineHeight ?? 'normal'}`,
    `mw-${s.maxWidth ?? 'full'}`,
    s.fullBleed ? 'full-bleed' : '',
    section.locked ? 'locked' : '',
    isChromeSection(section.type) ? 'is-chrome' : '',
    section.hidden ? 'is-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function sectionInline(section: CmsSection): CSSProperties {
  const s = section.style ?? {};
  return {
    background: s.backgroundColor || undefined,
    color: s.textColor || undefined,
    fontWeight: s.fontWeight || undefined,
    ['--sec-cols' as string]: String(s.columns ?? 3),
  };
}

export function CmsSectionPreview({
  section,
  brand,
  imageUrl,
  selected,
  focusField = null,
  canEdit = false,
  canMoveUp = false,
  canMoveDown = false,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
  onDropBefore,
}: Props) {
  const items = parseNamedItems(section.body);
  const faq = parseFaqPairs(section.body);
  const lines = splitBodyLines(section.body);
  const btnRadius = brand.buttonRadius ?? 'md';
  const chrome = isChromeSection(section.type);
  const movable = canEdit && !chrome && !section.locked;
  const fieldClass = (field: NonNullable<PreviewFocusField>) =>
    selected && focusField === field ? 'cms-field-lit' : '';

  function stop(e: SyntheticEvent) {
    e.stopPropagation();
  }

  function onDragStart(e: DragEvent) {
    if (!movable) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/cms-section-id', section.id);
    e.dataTransfer.effectAllowed = 'move';
    (e.currentTarget as HTMLElement).classList.add('is-dragging');
  }

  function onDragEnd(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('is-dragging');
  }

  function onDragOver(e: DragEvent) {
    if (!movable || !onDropBefore) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    (e.currentTarget as HTMLElement).classList.add('is-drop-target');
  }

  function onDragLeave(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('is-drop-target');
  }

  function onDrop(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('is-drop-target');
    if (!movable || !onDropBefore) return;
    e.preventDefault();
    const dragId = e.dataTransfer.getData('text/cms-section-id');
    if (!dragId || dragId === section.id) return;
    onDropBefore(dragId);
  }

  return (
    <section
      className={`${styleClass(section)} ${selected ? 'selected' : ''} ${selected && focusField ? `focus-${focusField}` : ''}`}
      style={sectionInline(section)}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      draggable={movable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      data-section-id={section.id}
      data-section-type={section.type}
    >
      {selected ? (
        <div className="cms-sec-pin" aria-hidden>
          Editing
        </div>
      ) : null}
      {chrome ? (
        <div className="cms-chrome-badge" title="Stays fixed on the page">
          Fixed
        </div>
      ) : null}
      {canEdit ? (
        <div className="cms-sec-toolbar" onClick={stop} onMouseDown={stop}>
          {chrome ? (
            <span className="cms-sec-toolbar-note">Fixed</span>
          ) : (
            <>
              <button
                type="button"
                title="Move up"
                disabled={!canMoveUp}
                onClick={() => onMoveUp?.()}
              >
                ↑
              </button>
              <button
                type="button"
                title="Move down"
                disabled={!canMoveDown}
                onClick={() => onMoveDown?.()}
              >
                ↓
              </button>
              <span className="cms-sec-drag-hint" title="Drag to reorder">
                ⋮⋮
              </span>
            </>
          )}
          <button
            type="button"
            className="cms-sec-remove"
            title={section.locked ? 'Unlock in Design to remove' : 'Remove section'}
            disabled={Boolean(section.locked)}
            onClick={() => onRemove?.()}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="cms-sec-inner">
        {section.type === 'hero' ? (
          <div className="cms-hero">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={section.imageAlt || ''}
                className={`cms-hero-media ${fieldClass('image')}`}
                data-field="image"
              />
            ) : null}
            <div className="cms-hero-copy">
              {section.heading ? (
                <h2 className={fieldClass('heading')} data-field="heading">
                  {section.heading}
                </h2>
              ) : null}
              {section.body ? (
                <p className={fieldClass('body')} data-field="body">
                  {section.body}
                </p>
              ) : null}
              {section.buttonLabel ? (
                <a
                  className={`cms-btn rad-${btnRadius} ${fieldClass('button')}`}
                  href={section.buttonHref || '#'}
                  data-field="button"
                  onClick={(e) => e.preventDefault()}
                >
                  {section.buttonLabel}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {section.type === 'banner' ? (
          <div className="cms-banner">
            {section.heading ? <strong>{section.heading}</strong> : null}
            {section.body ? <span>{section.body}</span> : null}
          </div>
        ) : null}

        {section.type === 'nav' || section.type === 'header' ? (
          <div className="cms-site-nav">
            <strong>{brand.siteName}</strong>
            <div className="cms-site-links">
              {lines.length
                ? lines
                    .join(' · ')
                    .split(/[·|]/)
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map((l) => (
                      <span key={l}>{l}</span>
                    ))
                : null}
            </div>
          </div>
        ) : null}

        {['text', 'embed'].includes(section.type) ? (
          <>
            {section.heading ? (
              <h2 className={fieldClass('heading')} data-field="heading">
                {section.heading}
              </h2>
            ) : null}
            {section.body ? (
              <p className={`cms-prose ${fieldClass('body')}`} data-field="body">
                {section.body}
              </p>
            ) : null}
          </>
        ) : null}

        {section.type === 'image' ? (
          <div className="cms-media-block">
            {imageUrl ? (
              <img src={imageUrl} alt={section.imageAlt || section.heading || ''} />
            ) : (
              <div className="cms-media-ph">Image</div>
            )}
            {section.heading ? <h3>{section.heading}</h3> : null}
            {section.body ? <p>{section.body}</p> : null}
          </div>
        ) : null}

        {section.type === 'gallery' ? (
          <>
            {section.heading ? <h2>{section.heading}</h2> : null}
            <div className="cms-gallery">
              {(lines.length ? lines : ['One', 'Two', 'Three']).map((label) => (
                <div key={label} className="cms-gallery-cell">
                  {imageUrl ? <img src={imageUrl} alt="" /> : <span>{label}</span>}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {section.type === 'video' || section.type === 'audio' ? (
          <div className="cms-av">
            <div className={`cms-av-stage is-${section.type}`}>
              <span>{section.type === 'video' ? '▶ Video preview' : '♪ Audio preview'}</span>
            </div>
            {section.heading ? <h3>{section.heading}</h3> : null}
            {section.body ? <p>{section.body}</p> : null}
          </div>
        ) : null}

        {['cards', 'services', 'grid', 'columns', 'team', 'pricing'].includes(section.type) ? (
          <>
            {section.heading ? <h2>{section.heading}</h2> : null}
            <div className={`cms-card-grid kind-${section.type}`}>
              {items.map((item) => (
                <article key={item.title} className="cms-card">
                  {section.type === 'team' ? <div className="cms-avatar">{item.title.slice(0, 1)}</div> : null}
                  <h3>{item.title}</h3>
                  {item.detail ? <p>{item.detail}</p> : null}
                  {section.type === 'pricing' ? (
                    <a className={`cms-btn ghost rad-${btnRadius}`} href="#" onClick={(e) => e.preventDefault()}>
                      Choose
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : null}

        {section.type === 'testimonials' ? (
          <>
            {section.heading ? <h2>{section.heading}</h2> : null}
            <div className="cms-quotes">
              {items.map((item) => (
                <blockquote key={item.title}>
                  <p>“{item.detail || item.title}”</p>
                  {item.detail ? <cite>{item.title}</cite> : null}
                </blockquote>
              ))}
            </div>
          </>
        ) : null}

        {section.type === 'faq' || section.type === 'accordion' ? (
          <>
            {section.heading ? <h2>{section.heading}</h2> : null}
            <div className="cms-faq">
              {faq.map((pair) => (
                <details key={pair.q} open={section.type === 'faq'}>
                  <summary>{pair.q}</summary>
                  {pair.a ? <p>{pair.a}</p> : null}
                </details>
              ))}
            </div>
          </>
        ) : null}

        {section.type === 'tabs' ? (
          <>
            {section.heading ? <h2>{section.heading}</h2> : null}
            <div className="cms-tabs">
              <div className="cms-tab-labels">
                {items.map((item, i) => (
                  <span key={item.title} className={i === 0 ? 'active' : ''}>
                    {item.title}
                  </span>
                ))}
              </div>
              <div className="cms-tab-panel">{items[0]?.detail || items[0]?.title}</div>
            </div>
          </>
        ) : null}

        {section.type === 'slider' ? (
          <>
            {section.heading ? <h2>{section.heading}</h2> : null}
            <div className="cms-slider">
              <div className="cms-slider-track">
                {(lines.length ? lines : ['Slide']).map((l, i) => (
                  <div key={l} className={`cms-slide ${i === 0 ? 'active' : ''}`}>
                    {l}
                  </div>
                ))}
              </div>
              <div className="cms-slider-dots">
                {(lines.length ? lines : ['']).map((_, i) => (
                  <i key={i} className={i === 0 ? 'on' : ''} />
                ))}
              </div>
            </div>
          </>
        ) : null}

        {section.type === 'cta' ? (
          <div className="cms-cta">
            {section.heading ? (
              <h2 className={fieldClass('heading')} data-field="heading">
                {section.heading}
              </h2>
            ) : null}
            {section.body ? (
              <p className={fieldClass('body')} data-field="body">
                {section.body}
              </p>
            ) : null}
            {section.buttonLabel ? (
              <a
                className={`cms-btn rad-${btnRadius} ${fieldClass('button')}`}
                href={section.buttonHref || '#'}
                data-field="button"
                onClick={(e) => e.preventDefault()}
              >
                {section.buttonLabel}
              </a>
            ) : null}
          </div>
        ) : null}

        {section.type === 'form' ? (
          <div className="cms-form">
            {section.heading ? <h2>{section.heading}</h2> : null}
            {(lines.length ? lines : ['Name', 'Email', 'Message']).map((field) => (
              <label key={field}>
                {field}
                <span className="cms-input-ph" />
              </label>
            ))}
            {section.buttonLabel ? (
              <a
                className={`cms-btn rad-${btnRadius}`}
                href={section.buttonHref || '#'}
                onClick={(e) => e.preventDefault()}
              >
                {section.buttonLabel}
              </a>
            ) : null}
          </div>
        ) : null}

        {section.type === 'map' ? (
          <div className="cms-map">
            <div className="cms-map-stage">Map preview</div>
            {section.heading ? <h3>{section.heading}</h3> : null}
            {section.body ? <p>{section.body}</p> : null}
          </div>
        ) : null}

        {section.type === 'footer' || section.type === 'social' ? (
          <div className="cms-footer">
            {section.heading ? <strong>{section.heading}</strong> : null}
            {section.body ? <p>{section.body}</p> : null}
          </div>
        ) : null}

        {section.locked && !chrome ? <span className="cms-lock-badge">Locked</span> : null}
      </div>
    </section>
  );
}
