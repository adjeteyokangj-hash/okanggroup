/**
 * Drag-reorder + undo stack semantics for Generic CMS freeze checks.
 * Run: node src/lib/cmsBuilder/ops.reorder.test.mjs
 */
import assert from 'node:assert/strict';

function isChromeNode(node) {
  return Boolean(node.chrome) || node.type === 'header' || node.type === 'footer' || node.type === 'nav';
}

function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const hit = findNode(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

function findParent(nodes, id, parent = null) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) return { parent, siblings: nodes, index: i };
    if (n.children?.length) {
      const hit = findParent(n.children, id, n);
      if (hit) return hit;
    }
  }
  return null;
}

function cloneWithoutId(nodes, id) {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children?.length ? { ...n, children: cloneWithoutId(n.children, id) } : n));
}

function moveNodeBefore(doc, dragId, beforeId) {
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
  if (!refreshed.parent) return { ...doc, tree: siblings };
  const apply = (nodes) =>
    nodes.map((n) => {
      if (n.id === refreshed.parent.id) return { ...n, children: siblings };
      if (n.children?.length) return { ...n, children: apply(n.children) };
      return n;
    });
  return { ...doc, tree: apply(tree) };
}

let doc = {
  tree: [
    { id: 'header', type: 'header', chrome: true, name: 'Header' },
    { id: 'a', type: 'frame', name: 'A' },
    { id: 'b', type: 'frame', name: 'B' },
    { id: 'c', type: 'frame', name: 'C' },
    { id: 'footer', type: 'footer', chrome: true, name: 'Footer' },
  ],
};

const history = [];
function commit(next) {
  history.push(JSON.parse(JSON.stringify(doc)));
  doc = next;
}
function undo() {
  if (!history.length) return;
  doc = history.pop();
}

// DnD: move C before A
const moved = moveNodeBefore(doc, 'c', 'a');
assert.ok(moved);
commit(moved);
assert.deepEqual(
  doc.tree.map((n) => n.id),
  ['header', 'c', 'a', 'b', 'footer'],
);

// Chrome cannot be reordered via drop
assert.equal(moveNodeBefore(doc, 'header', 'a'), null);

// Undo restores prior order (persistence of editor history stack)
undo();
assert.deepEqual(
  doc.tree.map((n) => n.id),
  ['header', 'a', 'b', 'c', 'footer'],
);

console.log('cmsBuilder ops reorder + undo ok');
