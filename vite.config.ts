import { defineConfig } from 'vite';
import neutralino from 'vite-plugin-neutralino';

export default defineConfig({
  plugins: [neutralino()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: false
  }
});
