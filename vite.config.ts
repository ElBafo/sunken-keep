import { readdirSync } from 'fs';
import { defineConfig } from 'vite';
import { resolve } from 'path';

function listTex3d(): string[] {
  try {
    return readdirSync(resolve(__dirname, 'public/proto3d/tex3d')).filter((f) =>
      f.endsWith('.png')
    );
  } catch {
    return [];
  }
}

export default defineConfig({
  base: '/sunken-keep/',
  define: {
    __TEX3D_FILES__: JSON.stringify(listTex3d())
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        proto3d: resolve(__dirname, 'proto3d.html')
      }
    }
  }
});
