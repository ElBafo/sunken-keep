/// <reference types="vite/client" />

declare const __TEX3D_FILES__: string[];

interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
