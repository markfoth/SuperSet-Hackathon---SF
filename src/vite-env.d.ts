/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASEMAP_URL?: string;
  readonly VITE_BASEMAP_ATTRIBUTION?: string;
  readonly VITE_COMMUTE_PROVIDER?: 'fixture' | 'proxy';
  readonly VITE_ROUTING_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
