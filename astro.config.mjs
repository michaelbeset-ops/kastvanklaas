// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { redirectPaden } from './src/lib/redirects.mjs';

// Echte domein: canonicals, og:image en sitemap moeten naar www.kastvanklaas.nl wijzen (DNS doen we pas bij livegang).
const doorverwijzingen = new Set(redirectPaden().map((r) => r.van));

export default defineConfig({
  site: 'https://www.kastvanklaas.nl',
  base: '/',
  // Oude WordPress-URL's eindigen allemaal op een slash; zo blijven ze exact gelijk.
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
  integrations: [
    sitemap({
      // Doorverwijspagina's horen niet in de sitemap, alleen echte pagina's.
      filter: (page) => !doorverwijzingen.has(new URL(page).pathname),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
