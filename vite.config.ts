import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Honour PORT when the environment assigns one, otherwise use Vite's default.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    open: false,
  },
  optimizeDeps: {
    /**
     * MapLibre spawns its tile-parsing worker from a URL relative to its own
     * module. Pre-bundling rewrites that URL into `.vite/deps/` but never emits
     * the worker chunk there, so the request 404s, the worker never starts, and
     * the map requests neither its style nor a single tile — it just hangs.
     *
     * On this page that surfaced as the tracking map permanently showing its
     * "basemap unavailable" fallback in dev while the tile host was perfectly
     * reachable. Serving maplibre unbundled keeps the worker URL resolving
     * against the real package. Dev only; the production build resolves the
     * worker through Rollup and is unaffected.
     */
    exclude: ['maplibre-gl'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * Keeps vendor weight out of the app chunk so per-route code splitting
         * stays meaningful. Charts and motion are heavy and not needed on first
         * paint, so they get their own chunks.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('apexcharts') || id.includes('react-apexcharts')) return 'charts';
          if (id.includes('framer-motion') || id.includes('motion-dom')) return 'motion';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('react-router') || id.includes('/react-dom/') || id.includes('/react/')) {
            return 'react';
          }

          return 'vendor';
        },
      },
    },
  },
});
