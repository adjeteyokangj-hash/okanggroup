import { useEffect, useState } from 'react';
import { signedCmsMediaUrl } from '../lib/files';
import type { ThFieldDef } from './tools/TreasureHouseStudioTools';

type Props = {
  moduleName: string;
  moduleCode: string;
  recordTitle: string;
  fields: ThFieldDef[];
  data: Record<string, string>;
  selectedFieldKey: string | null;
  previewMode?: boolean;
  canEdit: boolean;
  onSelectField: (key: string, kind: 'text' | 'image') => void;
  onChangeField: (key: string, value: string) => void;
};

function isTextField(type: string) {
  return ['text', 'textarea', 'string', 'richtext', 'markdown'].includes(type.toLowerCase());
}

function isImageField(type: string, key: string) {
  const t = type.toLowerCase();
  return (
    ['image', 'image_url', 'media', 'photo', 'file'].includes(t) ||
    /image|photo|media|asset/i.test(key)
  );
}

function CanvasImage({ path, alt }: { path: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    if (/^https?:\/\//i.test(path) || path.startsWith('blob:')) {
      setSrc(path);
      return;
    }
    let cancelled = false;
    void signedCmsMediaUrl(path)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) return <div className="vs-th-canvas-image-ph">No image</div>;
  if (!src) return <div className="vs-th-canvas-image-ph">Loading…</div>;
  return <img src={src} alt={alt} className="vs-th-canvas-img" />;
}

/**
 * Simulated shadow page canvas — not the live Treasure House church website.
 * Renders record fields as selectable page regions for Visual Studio.
 */
export function TreasureHousePageCanvas({
  moduleName,
  moduleCode,
  recordTitle,
  fields,
  data,
  selectedFieldKey,
  previewMode = false,
  canEdit,
  onSelectField,
  onChangeField,
}: Props) {
  const textFields = fields.filter((f) => isTextField(f.type));
  const imageFields = fields.filter((f) => isImageField(f.type, f.key));
  const otherFields = fields.filter(
    (f) => !isTextField(f.type) && !isImageField(f.type, f.key),
  );

  return (
    <div className={`vs-th-page-canvas${previewMode ? ' is-preview' : ''}`}>
      <div className="vs-th-sim-banner" role="status">
        Simulated shadow preview — synthetic OkangGroup data, not the live Treasure House church
        website
      </div>

      <div className="vs-th-sim-chrome" aria-hidden>
        <strong>Treasure House</strong>
        <span>Home</span>
        <span>About</span>
        <span>Ministries</span>
        <span>Contact</span>
      </div>

      <article className="vs-th-sim-page">
        <header className="vs-th-sim-page-head">
          <p className="vs-th-sim-kicker">
            {moduleName} · <code>{moduleCode}</code>
          </p>
          <h1
            className={selectedFieldKey === '__title__' ? 'is-selected' : ''}
            onClick={() => onSelectField('__title__', 'text')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectField('__title__', 'text');
            }}
            role="button"
            tabIndex={0}
          >
            {previewMode || !canEdit ? (
              recordTitle || 'Untitled page'
            ) : (
              <input
                className="vs-th-inline-input vs-th-title-input"
                value={recordTitle}
                aria-label="Page title"
                onChange={(e) => onChangeField('__title__', e.target.value)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectField('__title__', 'text');
                }}
              />
            )}
          </h1>
        </header>

        {imageFields.map((f) => (
          <section
            key={f.key}
            className={`vs-th-sim-block vs-th-sim-image${selectedFieldKey === f.key ? ' is-selected' : ''}`}
            onClick={() => onSelectField(f.key, 'image')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectField(f.key, 'image');
            }}
            role="button"
            tabIndex={0}
          >
            <span className="vs-th-sim-label">{f.label}</span>
            <CanvasImage path={data[f.key] ?? ''} alt={f.label} />
          </section>
        ))}

        {textFields.map((f) => {
          const long = ['textarea', 'richtext', 'markdown'].includes(f.type.toLowerCase());
          return (
            <section
              key={f.key}
              className={`vs-th-sim-block${selectedFieldKey === f.key ? ' is-selected' : ''}`}
              onClick={() => onSelectField(f.key, 'text')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectField(f.key, 'text');
              }}
              role="button"
              tabIndex={0}
            >
              <span className="vs-th-sim-label">{f.label}</span>
              {previewMode || !canEdit ? (
                long ? (
                  <p className="vs-th-sim-body">{data[f.key] || '—'}</p>
                ) : (
                  <h2 className="vs-th-sim-heading">{data[f.key] || '—'}</h2>
                )
              ) : long ? (
                <textarea
                  className="vs-th-inline-input"
                  rows={5}
                  value={data[f.key] ?? ''}
                  aria-label={f.label}
                  onChange={(e) => onChangeField(f.key, e.target.value)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectField(f.key, 'text');
                  }}
                />
              ) : (
                <input
                  className="vs-th-inline-input"
                  value={data[f.key] ?? ''}
                  aria-label={f.label}
                  onChange={(e) => onChangeField(f.key, e.target.value)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectField(f.key, 'text');
                  }}
                />
              )}
            </section>
          );
        })}

        {otherFields.length ? (
          <aside className="vs-th-sim-meta">
            <h3>Additional fields</h3>
            <p className="muted-sm">
              These shadow fields are available in Properties but are not primary page copy.
            </p>
            {otherFields.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`vs-th-meta-chip${selectedFieldKey === f.key ? ' is-selected' : ''}`}
                onClick={() =>
                  onSelectField(f.key, isImageField(f.type, f.key) ? 'image' : 'text')
                }
              >
                {f.label}
              </button>
            ))}
          </aside>
        ) : null}

        {!fields.length ? (
          <p className="vs-tool-hint">This module has no field schema yet in the shadow CMS.</p>
        ) : null}
      </article>
    </div>
  );
}
