import { useEffect, useState } from 'react';
import type { BuilderNode, CmsBuilderDoc } from '../../lib/cmsBuilder/types';
import { updateNodeProps, updateNodeStyle } from '../../lib/cmsBuilder';
import {
  STUDIO_FONT_FAMILIES,
  STUDIO_FONT_SIZES,
  STUDIO_SHADOWS,
} from '../../lib/marketingVisualStyle';

export type NativeEditorBridge = {
  doc: CmsBuilderDoc;
  selected: BuilderNode | null;
  canEdit: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  uploading: boolean;
  imagePreviewUrl: string | null;
  viewport: 'desktop' | 'tablet' | 'mobile';
  setViewport: (v: 'desktop' | 'tablet' | 'mobile') => void;
  applyDoc: (next: CmsBuilderDoc) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  setSelectedId: (id: string | null) => void;
  /** Upload/replace selected image via existing client CMS media library helpers. */
  onImageFile: (file: File | null) => void | Promise<void>;
};

function patchStyle(bridge: NativeEditorBridge, patch: Record<string, string | number | undefined>) {
  if (!bridge.canEdit || !bridge.selected) return;
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') continue;
    clean[k] = v;
  }
  bridge.applyDoc(updateNodeStyle(bridge.doc, bridge.selected.id, clean));
}

export function NativeTextTool({ bridge }: { bridge: NativeEditorBridge | null }) {
  if (!bridge?.selected) {
    return <p className="vs-tool-hint">Select a text or heading node on the canvas.</p>;
  }
  const node = bridge.selected;
  const style = node.style ?? {};
  const isText = node.type === 'text' || node.type === 'heading' || node.type === 'button';
  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">Native builder typography — updates the draft canvas immediately.</p>
      {isText ? (
        <label>
          Copy
          <textarea
            rows={3}
            value={node.props?.text ?? ''}
            disabled={!bridge.canEdit}
            onChange={(e) =>
              bridge.applyDoc(updateNodeProps(bridge.doc, node.id, { text: e.target.value }))
            }
          />
        </label>
      ) : (
        <p className="vs-tool-hint">Selected node type: {node.type}. Style controls still apply.</p>
      )}
      <label>
        Font family
        <select
          value={style.fontFamily ?? ''}
          disabled={!bridge.canEdit}
          onChange={(e) => patchStyle(bridge, { fontFamily: e.target.value || undefined })}
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
          value={style.fontSize ?? ''}
          disabled={!bridge.canEdit}
          onChange={(e) => patchStyle(bridge, { fontSize: e.target.value || undefined })}
        >
          <option value="">Inherit</option>
          {STUDIO_FONT_SIZES.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        Weight
        <select
          value={style.fontWeight ?? ''}
          disabled={!bridge.canEdit}
          onChange={(e) => patchStyle(bridge, { fontWeight: e.target.value || undefined })}
        >
          <option value="">Inherit</option>
          <option value="400">Regular</option>
          <option value="600">Semibold</option>
          <option value="700">Bold</option>
        </select>
      </label>
      <label>
        Align
        <select
          value={style.textAlign ?? ''}
          disabled={!bridge.canEdit}
          onChange={(e) =>
            patchStyle(bridge, {
              textAlign: (e.target.value || undefined) as 'left' | 'center' | 'right' | undefined,
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
        Text colour
        <input
          type="color"
          disabled={!bridge.canEdit}
          value={style.color && /^#/.test(style.color) ? style.color : '#1a1a1a'}
          onChange={(e) => patchStyle(bridge, { color: e.target.value })}
        />
      </label>
    </div>
  );
}

export function NativeColourTool({ bridge }: { bridge: NativeEditorBridge | null }) {
  if (!bridge?.selected) return <p className="vs-tool-hint">Select a node to edit colour.</p>;
  const style = bridge.selected.style ?? {};
  return (
    <div className="vs-tool">
      <label>
        Background
        <input
          type="color"
          disabled={!bridge.canEdit}
          value={style.backgroundColor && /^#/.test(style.backgroundColor) ? style.backgroundColor : '#ffffff'}
          onChange={(e) => patchStyle(bridge, { backgroundColor: e.target.value })}
        />
      </label>
      <label>
        Text
        <input
          type="color"
          disabled={!bridge.canEdit}
          value={style.color && /^#/.test(style.color) ? style.color : '#1a1a1a'}
          onChange={(e) => patchStyle(bridge, { color: e.target.value })}
        />
      </label>
      <label>
        Border
        <input
          type="color"
          disabled={!bridge.canEdit}
          value={style.borderColor && /^#/.test(style.borderColor) ? style.borderColor : '#cccccc'}
          onChange={(e) => patchStyle(bridge, { borderColor: e.target.value, borderWidth: style.borderWidth || '1px' })}
        />
      </label>
      <label>
        Opacity
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          disabled={!bridge.canEdit}
          value={style.opacity ?? 1}
          onChange={(e) => patchStyle(bridge, { opacity: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

export function NativeLayoutTool({ bridge }: { bridge: NativeEditorBridge | null }) {
  if (!bridge?.selected) return <p className="vs-tool-hint">Select a node to edit layout.</p>;
  const style = bridge.selected.style ?? {};
  return (
    <div className="vs-tool">
      <label>
        Padding
        <input
          value={style.padding ?? ''}
          disabled={!bridge.canEdit}
          placeholder="1rem"
          onChange={(e) => patchStyle(bridge, { padding: e.target.value || undefined })}
        />
      </label>
      <label>
        Margin
        <input
          value={style.margin ?? ''}
          disabled={!bridge.canEdit}
          placeholder="0"
          onChange={(e) => patchStyle(bridge, { margin: e.target.value || undefined })}
        />
      </label>
      <label>
        Gap
        <input
          value={style.gap ?? ''}
          disabled={!bridge.canEdit}
          placeholder="0.75rem"
          onChange={(e) => patchStyle(bridge, { gap: e.target.value || undefined })}
        />
      </label>
      <label>
        Max width
        <input
          value={style.maxWidth ?? ''}
          disabled={!bridge.canEdit}
          placeholder="720px"
          onChange={(e) => patchStyle(bridge, { maxWidth: e.target.value || undefined })}
        />
      </label>
    </div>
  );
}

export function NativeEffectsTool({ bridge }: { bridge: NativeEditorBridge | null }) {
  if (!bridge?.selected) return <p className="vs-tool-hint">Select a node to edit effects.</p>;
  const style = bridge.selected.style ?? {};
  return (
    <div className="vs-tool">
      <label>
        Shadow
        <select
          value={style.boxShadow ?? ''}
          disabled={!bridge.canEdit}
          onChange={(e) => patchStyle(bridge, { boxShadow: e.target.value || undefined })}
        >
          {STUDIO_SHADOWS.map((s) => (
            <option key={s.label} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Radius
        <input
          value={style.borderRadius ?? ''}
          disabled={!bridge.canEdit}
          placeholder="8px"
          onChange={(e) => patchStyle(bridge, { borderRadius: e.target.value || undefined })}
        />
      </label>
    </div>
  );
}

function NativeImagePreview({
  previewUrl,
  imagePath,
  alt,
  objectFit,
}: {
  previewUrl: string | null;
  imagePath?: string;
  alt: string;
  objectFit?: string;
}) {
  const [resolved, setResolved] = useState<string | null>(previewUrl);
  useEffect(() => {
    setResolved(previewUrl);
    if (previewUrl || !imagePath) return;
    let cancelled = false;
    void import('../../lib/files')
      .then(({ signedCmsMediaUrl }) => signedCmsMediaUrl(imagePath))
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [previewUrl, imagePath]);

  if (!resolved && !imagePath) return <p className="vs-tool-hint">No image attached yet.</p>;
  if (!resolved) return <p className="vs-tool-hint">Resolving preview…</p>;
  return (
    <div className="vs-image-preview">
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt edited below */}
      <img
        src={resolved}
        alt={alt}
        style={{
          maxWidth: '100%',
          borderRadius: 8,
          objectFit: (objectFit as 'cover' | 'contain' | 'fill' | undefined) ?? 'cover',
        }}
      />
    </div>
  );
}

export function NativeImageTool({ bridge }: { bridge: NativeEditorBridge | null }) {
  if (!bridge?.selected || bridge.selected.type !== 'image') {
    return <p className="vs-tool-hint">Select an image on the canvas to upload, replace or position it.</p>;
  }
  const node = bridge.selected;
  const props = node.props ?? {};
  const style = node.style ?? {};
  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Uploads use the existing OkangGroup media library for this website. Replacing an image stores a
        new asset and updates the draft node — originals remain in the library.
      </p>
      <NativeImagePreview
        previewUrl={bridge.imagePreviewUrl}
        imagePath={props.imagePath ?? undefined}
        alt={props.imageAlt ?? ''}
        objectFit={style.objectFit}
      />
      <label>
        Replace / upload
        <input
          type="file"
          accept="image/*"
          disabled={!bridge.canEdit || bridge.uploading}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = '';
            void bridge.onImageFile(file);
          }}
        />
      </label>
      {bridge.uploading ? <p className="vs-tool-hint">Uploading…</p> : null}
      <label>
        Alt text
        <input
          value={props.imageAlt ?? ''}
          disabled={!bridge.canEdit}
          onChange={(e) =>
            bridge.applyDoc(updateNodeProps(bridge.doc, node.id, { imageAlt: e.target.value }))
          }
        />
      </label>
      <label>
        Fit
        <select
          value={style.objectFit ?? ''}
          disabled={!bridge.canEdit}
          onChange={(e) => patchStyle(bridge, { objectFit: e.target.value || undefined })}
        >
          <option value="">Default</option>
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="fill">Fill</option>
        </select>
      </label>
      <label>
        Max width
        <select
          value={style.maxWidth ?? ''}
          disabled={!bridge.canEdit}
          onChange={(e) => patchStyle(bridge, { maxWidth: e.target.value || undefined })}
        >
          <option value="">Full</option>
          <option value="320px">320px</option>
          <option value="480px">480px</option>
          <option value="640px">640px</option>
          <option value="100%">100%</option>
        </select>
      </label>
      <p className="vs-tool-hint muted-sm">Storage path: {props.imagePath || 'none'}</p>
    </div>
  );
}

export function NativeAnimationTool({ bridge }: { bridge: NativeEditorBridge | null }) {
  if (!bridge?.selected) {
    return <p className="vs-tool-hint">Select a node to attach entrance / hover animations.</p>;
  }
  const editor = bridge;
  const targetId = editor.selected!.id;
  const interactions = editor.doc.interactions ?? [];
  const mine = interactions.filter((i) => i.targetId === targetId);

  function upsert(action: 'fade' | 'lift' | 'underline', trigger: 'hover' | 'click' | 'scroll') {
    if (!editor.canEdit) return;
    const existing = interactions.find(
      (i) => i.targetId === targetId && i.trigger === trigger && i.action === action,
    );
    if (existing) {
      editor.applyDoc({
        ...editor.doc,
        interactions: interactions.filter((i) => i.id !== existing.id),
      });
      return;
    }
    const id = `ix-${Date.now().toString(36)}`;
    editor.applyDoc({
      ...editor.doc,
      interactions: [...interactions, { id, trigger, targetId, action }],
    });
  }

  function has(action: 'fade' | 'lift' | 'underline', trigger: 'hover' | 'click' | 'scroll') {
    return mine.some((i) => i.action === action && i.trigger === trigger);
  }

  return (
    <div className="vs-tool">
      <p className="vs-tool-hint">
        Native builder interactions persist on the document. Prefer reduced motion on the public site.
        OpsWatch and Treasure House keep Animation disabled.
      </p>
      <label>
        Hover lift
        <input
          type="checkbox"
          disabled={!editor.canEdit}
          checked={has('lift', 'hover')}
          onChange={() => upsert('lift', 'hover')}
        />
      </label>
      <label>
        Hover fade
        <input
          type="checkbox"
          disabled={!editor.canEdit}
          checked={has('fade', 'hover')}
          onChange={() => upsert('fade', 'hover')}
        />
      </label>
      <label>
        Hover underline
        <input
          type="checkbox"
          disabled={!editor.canEdit}
          checked={has('underline', 'hover')}
          onChange={() => upsert('underline', 'hover')}
        />
      </label>
      <label>
        Scroll fade in
        <input
          type="checkbox"
          disabled={!editor.canEdit}
          checked={has('fade', 'scroll')}
          onChange={() => upsert('fade', 'scroll')}
        />
      </label>
      {mine.length ? (
        <p className="vs-tool-hint">{mine.length} interaction(s) on this element.</p>
      ) : (
        <p className="vs-tool-hint">No interactions on this element yet.</p>
      )}
    </div>
  );
}
