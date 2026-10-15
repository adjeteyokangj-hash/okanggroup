import { useEffect, useState } from 'react';
import { signedCmsMediaUrl } from '../../lib/files';

export type ThFieldDef = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
};

export type TreasureHouseEditorBridge = {
  moduleCode: string;
  moduleName: string;
  recordId: string | null;
  recordTitle: string;
  fields: ThFieldDef[];
  data: Record<string, string>;
  canEdit: boolean;
  setTitle: (title: string) => void;
  setField: (key: string, value: string) => void;
  saveDraft: () => void;
  uploadingKey: string | null;
  uploadFieldImage: (key: string, file: File) => void | Promise<void>;
  selectedFieldKey?: string | null;
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

function looksLikeStoragePath(value: string) {
  if (!value || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:')) {
    return false;
  }
  return value.includes('/');
}

function FieldImagePreview({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(
    path.startsWith('http') || path.startsWith('blob:') ? path : null,
  );

  useEffect(() => {
    if (!path) {
      setSrc(null);
      return;
    }
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
      setSrc(path);
      return;
    }
    if (!looksLikeStoragePath(path)) {
      setSrc(null);
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

  if (!src) return null;
  return (
    <img
      className="vs-image-preview-img"
      src={src}
      alt=""
      style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8 }}
    />
  );
}

export function TreasureHouseTextTool({
  bridge,
  focusFieldKey = null,
}: {
  bridge: TreasureHouseEditorBridge | null;
  focusFieldKey?: string | null;
}) {
  if (!bridge) {
    return (
      <p className="vs-tool-hint">
        Select a page in Layers, then click a text region on the canvas. Colour, layout and effects
        stay disabled — they are not in the shadow CMS field schemas.
      </p>
    );
  }
  if (!bridge.recordId && !bridge.recordTitle) {
    return (
      <p className="vs-tool-hint">
        Choose or create a page under <strong>{bridge.moduleName}</strong> to edit copy.
      </p>
    );
  }

  if (focusFieldKey === '__title__') {
    return (
      <div className="vs-tool">
        <p className="vs-tool-hint">Editing page title for <strong>{bridge.moduleName}</strong>.</p>
        <label>
          Page title
          <input
            value={bridge.recordTitle}
            disabled={!bridge.canEdit}
            onChange={(e) => bridge.setTitle(e.target.value)}
          />
        </label>
        {bridge.canEdit ? (
          <button type="button" onClick={() => bridge.saveDraft()}>
            Save draft
          </button>
        ) : null}
      </div>
    );
  }

  const textFields = bridge.fields.filter((f) => isTextField(f.type));
  const focused = focusFieldKey
    ? textFields.filter((f) => f.key === focusFieldKey)
    : textFields;
  if (!focused.length) {
    return (
      <p className="vs-tool-hint">
        {focusFieldKey
          ? 'The selected canvas element is not a text field. Use Image Studio or select a heading/body block.'
          : `Module ${bridge.moduleCode} has no text fields.`}
      </p>
    );
  }
  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Shadow CMS text fields for <strong>{bridge.moduleName}</strong>. Saves as draft only — never
        production Treasure House.
      </p>
      {focused.map((f) => (
        <label key={f.key}>
          {f.label}
          {f.type.toLowerCase() === 'textarea' || f.type.toLowerCase() === 'richtext' ? (
            <textarea
              rows={4}
              value={bridge.data[f.key] ?? ''}
              disabled={!bridge.canEdit}
              onChange={(e) => bridge.setField(f.key, e.target.value)}
            />
          ) : (
            <input
              value={bridge.data[f.key] ?? ''}
              disabled={!bridge.canEdit}
              onChange={(e) => bridge.setField(f.key, e.target.value)}
            />
          )}
        </label>
      ))}
      {bridge.canEdit ? (
        <button type="button" onClick={() => bridge.saveDraft()}>
          Save draft
        </button>
      ) : null}
    </div>
  );
}

export function TreasureHouseImageTool({
  bridge,
  focusFieldKey = null,
}: {
  bridge: TreasureHouseEditorBridge | null;
  focusFieldKey?: string | null;
}) {
  if (!bridge) {
    return <p className="vs-tool-hint">Select an image region on the simulated page canvas.</p>;
  }
  const imageFields = bridge.fields.filter((f) => isImageField(f.type, f.key));
  const focused =
    focusFieldKey && focusFieldKey !== '__title__'
      ? imageFields.filter((f) => f.key === focusFieldKey)
      : imageFields;
  if (!focused.length) {
    return (
      <p className="vs-tool-hint">
        {focusFieldKey
          ? 'The selected element is not an image field.'
          : `No image fields on ${bridge.moduleCode}. Use CMS Management → Media for the library.`}
      </p>
    );
  }
  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Uploads use the OkangGroup media library for this shadow instance. Paths are stored on the
        draft record only.
      </p>
      {focused.map((f) => (
        <div key={f.key} className="vs-th-image-field">
          <label>
            {f.label} (URL / path)
            <input
              value={bridge.data[f.key] ?? ''}
              disabled={!bridge.canEdit}
              onChange={(e) => bridge.setField(f.key, e.target.value)}
            />
          </label>
          <label>
            Upload / replace
            <input
              type="file"
              accept="image/*"
              disabled={!bridge.canEdit || bridge.uploadingKey === f.key}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void bridge.uploadFieldImage(f.key, file);
              }}
            />
          </label>
          {bridge.uploadingKey === f.key ? <p className="vs-tool-hint">Uploading…</p> : null}
          {bridge.data[f.key] ? <FieldImagePreview path={bridge.data[f.key]} /> : null}
        </div>
      ))}
      {bridge.canEdit ? (
        <button type="button" onClick={() => bridge.saveDraft()}>
          Save draft
        </button>
      ) : null}
    </div>
  );
}
