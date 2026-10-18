import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/mdms/',
  resolve: {
    alias: {
      '@swisd-project/mdms': path.resolve(__dirname, '../src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
  },
});