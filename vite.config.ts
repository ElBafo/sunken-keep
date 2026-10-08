import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sunken-keep/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0
  }
});
