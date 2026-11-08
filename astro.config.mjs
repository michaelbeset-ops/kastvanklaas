// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { redirectPaden } from './src/lib/redirects.mjs';
import { onvertaaldePaden } from './src/lib/vertalingen.mjs';

// Echte domein: canonicals, og:image en sitemap moeten naar www.kastvanklaas.nl wijzen (DNS doen we pas bij livegang).
const doorverwijzingen = new Set(redirectPaden().map((r) => r.van));
// DE/EN-kastpagina's zonder vertaling staan op noindex: niet in de sitemap tot er een vertaling is.
const onvertaald = onvertaaldePaden();

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
      filter: (page) => {
        const pad = new URL(page).pathname;
        return !doorverwijzingen.has(pad) && !onvertaald.has(pad) && !/^\/(de|en)\/404\/$/.test(pad);
      },
      // Elke URL krijgt zijn taalversies als xhtml:link (hreflang), op basis van het /de/- en /en/-voorvoegsel.
      i18n: { defaultLocale: 'nl', locales: { nl: 'nl', de: 'de', en: 'en' } },
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
