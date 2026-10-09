import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server forwards /api to the Express server, so the browser only ever
// talks to one origin and no CORS setup is needed while developing.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': process.env.VITE_API_TARGET || 'http://localhost:4000' },
  },
});
