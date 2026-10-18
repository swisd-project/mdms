import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/mdms/', // Required for GitHub Pages subpath routing
  resolve: {
    alias: {
      // Point directly to the core library source for instant hot-reloading
      'mdms': path.resolve(__dirname, '../src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
  },
});