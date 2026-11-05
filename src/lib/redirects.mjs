// Alle oude URL's die geen eigen pagina meer krijgen, met hun beste nieuwe bestemming.
// Gedeeld door astro.config (sitemap-filter), de doorverwijspagina's en tools/check-urls.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { soortenMetPagina } from './soorten.mjs';

// Via cwd en niet import.meta.url: Vite bundelt dit bestand mee, dan klopt het eigen pad niet meer.
const DATA = path.resolve(process.cwd(), 'src', 'data', 'oude-urls.json');

// Categorieen die als echte collectiepagina blijven bestaan.
export const ECHTE_CATEGORIEEN = ['india-kasten', 'indiase-tafels', 'accessoires', 'tuinmeubels', 'inspiratie', 'joosjedoodles', 'nieuws-van-klaas'];

// Tag zonder producten in de export: kies op trefwoord. Anders de categorie waar de meeste producten met die tag in zitten.
function tagDoel(slug, info) {
  if (info) {
    const [cat] = Object.entries(info.cats).sort((a, b) => b[1] - a[1])[0];
    if (ECHTE_CATEGORIEEN.includes(cat) && !['inspiratie', 'nieuws-van-klaas'].includes(cat)) return `/webshop/cat/${cat}/`;
  }
  if (/tafel|bankje|kruk/.test(slug)) return '/webshop/cat/indiase-tafels/';
  if (/lamp|accessoire|deur|spiegel|rugzak|blik|plateau/.test(slug)) return '/webshop/cat/accessoires/';
  if (/tuin/.test(slug)) return '/webshop/cat/tuinmeubels/';
  if (/kast|vitrine|rek|commode|dressoir|kamer|gang/.test(slug)) return '/webshop/cat/india-kasten/';
  return '/webshop/';
}

export function redirectPaden() {
  const oud = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const uit = [];
  // Tags met genoeg kasten zijn een echte soortpagina geworden (src/lib/soorten.mjs); de rest verwijst door.
  const echt = new Set(soortenMetPagina().map((s) => s.tag));
  for (const p of oud.tags) {
    const slug = p.split('/').filter(Boolean).pop();
    if (echt.has(slug)) continue;
    const naar = /^(vitrine|vitrinekast|vitrine-kast|hoge-vitrinekast|hoge-vitrineksat|lage-vitrinekast|grote-vitrinekast)$/.test(slug) ? '/vitrinekast-uit-india/' : tagDoel(slug, oud.tagInfo[slug]);
    uit.push({ van: p, naar });
  }
  // WooCommerce-pagina's die zonder online afrekenen geen doel meer hebben.
  uit.push({ van: '/winkelmand/', naar: '/webshop/' });
  uit.push({ van: '/afrekenen/', naar: '/webshop/' });
  uit.push({ van: '/mijn-account/', naar: '/contact/' });
  uit.push({ van: '/geen-categorie/joosjedoodles/', naar: '/joosjedoodles/' });
  // Drie bijna lege kopieen van de JoosjeDoodles-pagina: samen naar de ene pagina.
  for (const p of ['/joosjedoodles-2/', '/joosjedoodles-3/', '/joosjedoodles/illustratie-en-ontwerp-joosjedoodles/']) uit.push({ van: p, naar: '/joosjedoodles/' });
  // Oude subcategorieen uit het menu (niet in de sitemap, wel gelinkt en mogelijk geindexeerd).
  for (const p of oud.crawlCategorieen) {
    const slug = p.split('/').filter(Boolean).pop();
    if (ECHTE_CATEGORIEEN.includes(slug)) continue;
    const naar = slug === 'afwijkende-openingstijden' ? '/contact/' : slug === 'styling' ? '/webshop/styling-advies/' : '/webshop/cat/india-kasten/';
    uit.push({ van: p, naar });
  }
  // Paginering van de oude winkel (/page/2/ enz.) wijst naar de lijst zelf; die toont nu alles op een pagina.
  for (let n = 2; n <= 12; n++) {
    uit.push({ van: `/webshop/page/${n}/`, naar: '/webshop/' });
    for (const c of ECHTE_CATEGORIEEN) uit.push({ van: `/webshop/cat/${c}/page/${n}/`, naar: `/webshop/cat/${c}/` });
  }
  const gezien = new Set();
  return uit.filter((r) => !gezien.has(r.van) && gezien.add(r.van));
}
