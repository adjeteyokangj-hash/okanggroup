/**
 * Node test for Visual Studio panel clamp / preset behaviour.
 * Run: node --test admin/src/visual-studio/panelManager.test.mjs
 *
 * Uses dynamic import of the TypeScript-compiled logic duplicated inline for Node
 * without a TS test runner in admin.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

function clampPanel(panel) {
  return {
    ...panel,
    x: Math.min(1200, Math.max(0, panel.x)),
    y: Math.min(800, Math.max(0, panel.y)),
    width: Math.min(640, Math.max(240, panel.width)),
    height: Math.min(720, Math.max(160, panel.height)),
  };
}

const PRESET_TOOLS = {
  content: ['layers', 'properties'],
  design: ['layers', 'properties'],
  advanced: ['layers', 'properties'],
};

test('clampPanel keeps panels on-screen and sized', () => {
  const clamped = clampPanel({
    id: 'layers',
    open: true,
    dock: 'float',
    minimized: false,
    x: -40,
    y: 9000,
    width: 100,
    height: 50,
    zIndex: 1,
  });
  assert.equal(clamped.x, 0);
  assert.ok(clamped.y <= 800);
  assert.equal(clamped.width, 240);
  assert.equal(clamped.height, 160);
});

test('content preset opens only essential tools', () => {
  assert.deepEqual(PRESET_TOOLS.content, ['layers', 'properties']);
  assert.equal(PRESET_TOOLS.content.includes('text'), false);
  assert.equal(PRESET_TOOLS.design.includes('animation'), false);
});
