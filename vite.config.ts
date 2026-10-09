import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/sunken-keep/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        proto3d: resolve(__dirname, 'proto3d.html')
      }
    }
  }
});
