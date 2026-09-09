import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/proxy': 'http://127.0.0.1:8787' } },
  build: { target: 'es2022', sourcemap: false, license: { fileName: 'licenses.md' } },
});
