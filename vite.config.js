import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    open: true,
  },
  // JSON import for Company CMS publish bundle (content/cms/current.json).
  json: {
    namedExports: false,
    stringify: false,
  },
});
