import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Express server owns /api and serves the built client from dist/.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
