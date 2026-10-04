// Builds the React front end in client/ into client/dist, which server.js serves.
// `npm run dev` runs Vite's dev server with hot reload and forwards /api calls to Express.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: { '/api': `http://localhost:${process.env.PORT || 3000}` },
  },
});
