import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolves '@sqirl/shared' imports to the shared source tree.
      '@sqirl/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
