import {
  CmsBuilderDoc,
  canReorderSibling,
  flattenNodes,
  isChromeNode,
  removeNode,
  reorderSibling,
} from '../../lib/cmsBuilder';

type Props = {
  doc: CmsBuilderDoc;
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (id: string) => void;
  onChange: (doc: CmsBuilderDoc) => void;
};

export function BuilderLayers({ doc, selectedId, canEdit, onSelect, onChange }: Props) {
  const rows = flattenNodes(doc.tree);

  function move(id: string, dir: -1 | 1) {
    const next = reorderSibling(doc, id, dir);
    if (next) onChange(next);
  }

  function remove(id: string) {
    onChange(removeNode(doc, id));
    if (selectedId === id) onSelect(doc.tree[0]?.id ?? '');
  }

  return (
    <ul className="cms-layers cms-builder-layers">
      {rows.map(({ node, depth }) => (
        <li key={node.id} className={node.id === selectedId ? 'on' : ''} style={{ paddingLeft: `${depth * 0.75}rem` }}>
          <button type="button" className="cms-layer-main" onClick={() => onSelect(node.id)}>
            <span className="cms-layer-idx">{node.type}</span>
            <span>
              <strong>{node.name || node.type}</strong>
              <em>
                {isChromeNode(node) ? 'fixed' : node.locked ? 'locked' : node.hidden ? 'hidden' : 'block'}
              </em>
            </span>
          </button>
          {canEdit ? (
            <div className="cms-layer-ops">
              <button
                type="button"
                title={isChromeNode(node) ? 'Fixed chrome' : 'Move up'}
                disabled={!canReorderSibling(doc, node.id, -1)}
                onClick={() => move(node.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                title={isChromeNode(node) ? 'Fixed chrome' : 'Move down'}
                disabled={!canReorderSibling(doc, node.id, 1)}
                onClick={() => move(node.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                title={node.locked ? 'Unlock in Design' : 'Remove'}
                disabled={Boolean(node.locked)}
                onClick={() => remove(node.id)}
              >
                ×
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
