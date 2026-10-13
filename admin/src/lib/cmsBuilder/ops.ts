import { BuilderNode, CmsBuilderDoc, isChromeNode, newNodeId } from './types';

export function findNode(nodes: BuilderNode[], id: string): BuilderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const hit = findNode(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function findParent(
  nodes: BuilderNode[],
  id: string,
  parent: BuilderNode | null = null,
): { parent: BuilderNode | null; index: number; siblings: BuilderNode[] } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { parent, index: i, siblings: nodes };
    if (nodes[i].children?.length) {
      const hit = findParent(nodes[i].children!, id, nodes[i]);
      if (hit) return hit;
    }
  }
  return null;
}

export function mapTree(nodes: BuilderNode[], fn: (n: BuilderNode) => BuilderNode): BuilderNode[] {
  return nodes.map((n) => {
    const next = fn(n);
    if (next.children?.length) {
      return { ...next, children: mapTree(next.children, fn) };
    }
    return next;
  });
}

export function updateNode(
  doc: CmsBuilderDoc,
  id: string,
  patch: Partial<BuilderNode>,
): CmsBuilderDoc {
  return {
    ...doc,
    tree: mapTree(doc.tree, (n) => (n.id === id ? { ...n, ...patch, id: n.id, type: patch.type ?? n.type } : n)),
  };
}

export function updateNodeStyle(
  doc: CmsBuilderDoc,
  id: string,
  stylePatch: Partial<NonNullable<BuilderNode['style']>>,
): CmsBuilderDoc {
  const node = findNode(doc.tree, id);
  if (!node) return doc;
  return updateNode(doc, id, { style: { ...node.style, ...stylePatch } });
}

export function updateNodeProps(
  doc: CmsBuilderDoc,
  id: string,
  propsPatch: Partial<NonNullable<BuilderNode['props']>>,
): CmsBuilderDoc {
  const node = findNode(doc.tree, id);
  if (!node) return doc;
  return updateNode(doc, id, { props: { ...node.props, ...propsPatch } });
}

function cloneWithoutId(nodes: BuilderNode[], removeId: string): BuilderNode[] {
  const out: BuilderNode[] = [];
  for (const n of nodes) {
    if (n.id === removeId) continue;
    out.push({
      ...n,
      children: n.children ? cloneWithoutId(n.children, removeId) : undefined,
    });
  }
  return out;
}

export function removeNode(doc: CmsBuilderDoc, id: string): CmsBuilderDoc {
  const node = findNode(doc.tree, id);
  if (!node) return doc;
  if (node.locked) return doc;
  return { ...doc, tree: cloneWithoutId(doc.tree, id) };
}

/** Reorder among siblings; chrome nodes stay fixed. */
export function reorderSibling(doc: CmsBuilderDoc, id: string, dir: -1 | 1): CmsBuilderDoc | null {
  const loc = findParent(doc.tree, id);
  if (!loc) return null;
  const node = loc.siblings[loc.index];
  if (isChromeNode(node) || node.locked) return null;

  let to = loc.index + dir;
  while (to >= 0 && to < loc.siblings.length && isChromeNode(loc.siblings[to])) {
    to += dir;
  }
  if (to < 0 || to >= loc.siblings.length) return null;
  if (isChromeNode(loc.siblings[to]) || loc.siblings[to].locked) return null;

  const siblings = [...loc.siblings];
  const [item] = siblings.splice(loc.index, 1);
  siblings.splice(to, 0, item);

  if (!loc.parent) {
    return { ...doc, tree: siblings };
  }
  return updateNode(doc, loc.parent.id, { children: siblings });
}

export function canReorderSibling(doc: CmsBuilderDoc, id: string, dir: -1 | 1): boolean {
  return Boolean(reorderSibling(doc, id, dir));
}

/** Move node before target among same parent level when possible; else insert beside target's parent siblings. */
export function moveNodeBefore(doc: CmsBuilderDoc, dragId: string, beforeId: string): CmsBuilderDoc | null {
  if (dragId === beforeId) return null;
  const drag = findNode(doc.tree, dragId);
  const before = findNode(doc.tree, beforeId);
  if (!drag || !before) return null;
  if (isChromeNode(drag) || drag.locked) return null;
  if (isChromeNode(before)) return null;

  const beforeLoc = findParent(doc.tree, beforeId);
  if (!beforeLoc) return null;

  let tree = cloneWithoutId(doc.tree, dragId);
  const refreshed = findParent(tree, beforeId);
  if (!refreshed) return null;
  const siblings = [...refreshed.siblings];
  const insertAt = siblings.findIndex((s) => s.id === beforeId);
  if (insertAt < 0) return null;
  siblings.splice(insertAt, 0, drag);

  if (!refreshed.parent) {
    return { ...doc, tree: siblings };
  }
  // rebuild with updated children on parent
  const apply = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes.map((n) => {
      if (n.id === refreshed.parent!.id) return { ...n, children: siblings };
      if (n.children?.length) return { ...n, children: apply(n.children) };
      return n;
    });
  return { ...doc, tree: apply(tree) };
}

/** Nest drag into a container node (stack/grid/frame/card). */
export function nestInto(doc: CmsBuilderDoc, dragId: string, parentId: string): CmsBuilderDoc | null {
  if (dragId === parentId) return null;
  const drag = findNode(doc.tree, dragId);
  const parent = findNode(doc.tree, parentId);
  if (!drag || !parent) return null;
  if (isChromeNode(drag) || drag.locked) return null;
  if (!['frame', 'stack', 'grid', 'card', 'form'].includes(parent.type)) return null;
  // prevent nesting into own descendant
  if (findNode(drag.children ?? [], parentId)) return null;

  let tree = cloneWithoutId(doc.tree, dragId);
  const apply = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes.map((n) => {
      if (n.id === parentId) {
        return { ...n, children: [...(n.children ?? []), drag] };
      }
      if (n.children?.length) return { ...n, children: apply(n.children) };
      return n;
    });
  return { ...doc, tree: apply(tree) };
}

export function insertRootNode(doc: CmsBuilderDoc, node: BuilderNode): CmsBuilderDoc {
  if (node.type === 'header' || node.type === 'nav') {
    const firstBody = doc.tree.findIndex((n) => !isChromeNode(n) || n.type === 'footer');
    const at = firstBody < 0 ? doc.tree.length : firstBody;
    const tree = [...doc.tree];
    tree.splice(at, 0, { ...node, chrome: true });
    return { ...doc, tree };
  }
  if (node.type === 'footer') {
    return { ...doc, tree: [...doc.tree, { ...node, chrome: true }] };
  }
  const footerAt = doc.tree.findIndex((n) => n.type === 'footer');
  if (footerAt >= 0) {
    const tree = [...doc.tree];
    tree.splice(footerAt, 0, node);
    return { ...doc, tree };
  }
  return { ...doc, tree: [...doc.tree, node] };
}

export function insertChild(doc: CmsBuilderDoc, parentId: string, node: BuilderNode): CmsBuilderDoc {
  const parent = findNode(doc.tree, parentId);
  if (!parent) return insertRootNode(doc, node);
  return updateNode(doc, parentId, { children: [...(parent.children ?? []), node] });
}

export function duplicateNode(doc: CmsBuilderDoc, id: string): CmsBuilderDoc {
  const loc = findParent(doc.tree, id);
  const node = findNode(doc.tree, id);
  if (!loc || !node || isChromeNode(node)) return doc;

  const deepClone = (n: BuilderNode): BuilderNode => ({
    ...n,
    id: newNodeId(),
    children: n.children?.map(deepClone),
  });
  const copy = deepClone(node);
  const siblings = [...loc.siblings];
  siblings.splice(loc.index + 1, 0, copy);
  if (!loc.parent) return { ...doc, tree: siblings };
  return updateNode(doc, loc.parent.id, { children: siblings });
}

export function flattenNodes(nodes: BuilderNode[], depth = 0): { node: BuilderNode; depth: number }[] {
  const out: { node: BuilderNode; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children?.length) out.push(...flattenNodes(n.children, depth + 1));
  }
  return out;
}
