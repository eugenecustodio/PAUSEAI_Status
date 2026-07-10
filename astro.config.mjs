import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://eugenecustodio.github.io',
  base: '/PAUSEAI_Status',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), sitemap()],
  build: {
    assets: '_assets',
  },
  vite: {
    build: {
      sourcemap: false,
    },
  },
});
