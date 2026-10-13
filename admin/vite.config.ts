import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Vite base `/admin/` requires a trailing slash; redirect bare `/admin`. */
function redirectAdminBase(): Plugin {
  return {
    name: 'redirect-admin-base',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/admin') {
          res.statusCode = 302;
          res.setHeader('Location', '/admin/');
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), redirectAdminBase()],
  base: '/admin/',
  server: {
    port: 5174,
    proxy: {},
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

