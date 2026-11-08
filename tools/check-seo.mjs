// SEO-controle op dist/, voor alle drie de talen (NL op de root, DE onder /de/, EN onder /en/).
// Per echte pagina: unieke title en meta description (binnen een taal en over de talen heen), lengtes, canonical op www
// naar de pagina zelf, juiste <html lang> en og:locale, een og:image, precies een h1, alt-tekst op elke afbeelding,
// geen em-dash. Per indexeerbare pagina ook hreflang: zichzelf, x-default naar NL, alleen naar bestaande indexeerbare
// pagina's, en wederzijds (wijst A naar B, dan wijst B terug naar A). Doorverwijspagina's worden overgeslagen.
// Gebruik: npm run build && npm run check-seo   (exit 1 bij een probleem)
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://www.kastvanklaas.nl';
const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const TALEN = { nl: { lang: 'nl', og: 'nl_NL' }, de: { lang: 'de', og: 'de_DE' }, en: { lang: 'en', og: 'en_GB' } };
const taalVan = (pad) => (pad.match(/^\/(de|en)\//)?.[1] ?? 'nl');

const bestanden = [];
(function loop(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'beheer' && f !== '_astro') loop(p); }
    else if (f === 'index.html') bestanden.push(p);
  }
})(DIST);

const attr = (tag, naam) => tag.match(new RegExp(`\\s${naam}="([^"]*)"`))?.[1];
const paginas = new Map();
for (const p of bestanden) {
  const h = fs.readFileSync(p, 'utf8');
  if (h.includes('http-equiv="refresh"')) continue;
  const pad = '/' + path.relative(DIST, path.dirname(p)).split(path.sep).join('/') + '/';
  const hreflang = new Map();
  for (const l of h.match(/<link rel="alternate" hreflang="[^"]*" href="[^"]*"[^>]*>/g) ?? []) hreflang.set(attr(l, 'hreflang'), attr(l, 'href'));
  paginas.set(pad.replace(/^\/\.\//, '/').replace('//', '/'), {
    h,
    titel: h.match(/<title>([^<]*)<\/title>/)?.[1],
    beschr: h.match(/<meta name="description" content="([^"]*)"/)?.[1],
    canonical: h.match(/<link rel="canonical" href="([^"]*)"/)?.[1],
    lang: h.match(/<html lang="([^"]*)"/)?.[1],
    og: h.match(/<meta property="og:locale" content="([^"]*)"/)?.[1],
    noindex: /<meta name="robots" content="[^"]*noindex/.test(h),
    hreflang,
  });
}

const fouten = [];
const titels = new Map(), beschr = new Map();
const telling = { nl: 0, de: 0, en: 0 }, noindexTelling = { nl: 0, de: 0, en: 0 };
const zet = (m, k, v) => (m.get(k) ?? m.set(k, []).get(k)).push(v);

for (const [pad, p] of paginas) {
  const taal = taalVan(pad);
  telling[taal]++;
  if (p.noindex) noindexTelling[taal]++;
  const { titel: t, beschr: d, canonical: c, h } = p;
  if (!t) fouten.push(`${pad}: geen title`); else if (!p.noindex) zet(titels, t, pad);
  if (!d) fouten.push(`${pad}: geen description`); else if (!p.noindex) zet(beschr, d, pad);
  if (t && t.length > 70) fouten.push(`${pad}: title ${t.length} tekens (max 70)`);
  if (d && (d.length < 70 || d.length > 160)) fouten.push(`${pad}: description ${d.length} tekens`);
  if ((t ?? '').includes('—') || (d ?? '').includes('—')) fouten.push(`${pad}: em-dash in title of description`);
  if (c !== SITE + pad) fouten.push(`${pad}: canonical ${c ?? 'ontbreekt'} (verwacht ${SITE + pad})`);
  if (p.lang !== TALEN[taal].lang) fouten.push(`${pad}: <html lang="${p.lang}"> (verwacht ${TALEN[taal].lang})`);
  if (p.og !== TALEN[taal].og) fouten.push(`${pad}: og:locale ${p.og} (verwacht ${TALEN[taal].og})`);
  if (!/<meta property="og:image" content="https:\/\//.test(h)) fouten.push(`${pad}: geen absolute og:image`);
  const h1 = (h.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) fouten.push(`${pad}: ${h1} h1's`);
  for (const img of h.match(/<img [^>]*>/g) ?? []) if (!/\salt(=|\s|>)/.test(img)) fouten.push(`${pad}: afbeelding zonder alt`);

  // ---- hreflang (alleen indexeerbare pagina's; een noindex-vertaling verwijst hooguit naar NL)
  if (p.noindex) continue;
  if (!p.hreflang.size) { fouten.push(`${pad}: geen hreflang`); continue; }
  if (p.hreflang.get(taal) !== SITE + pad) fouten.push(`${pad}: hreflang="${taal}" wijst niet naar zichzelf`);
  const nlPad = pad.replace(/^\/(de|en)\//, '/');
  if (p.hreflang.get('x-default') !== SITE + nlPad) fouten.push(`${pad}: x-default ontbreekt of wijst niet naar ${nlPad}`);
  for (const [hl, href] of p.hreflang) {
    if (hl === 'x-default') continue;
    if (!TALEN[hl]) { fouten.push(`${pad}: onbekende hreflang "${hl}"`); continue; }
    if (!href?.startsWith(SITE + '/')) { fouten.push(`${pad}: hreflang ${hl} niet op www: ${href}`); continue; }
    const doel = href.slice(SITE.length);
    const dp = paginas.get(doel);
    if (!dp) fouten.push(`${pad}: hreflang ${hl} naar niet-bestaande pagina ${doel}`);
    else if (dp.noindex) fouten.push(`${pad}: hreflang ${hl} naar noindex-pagina ${doel}`);
    else if (dp.hreflang.get(taal) !== SITE + pad) fouten.push(`${pad}: hreflang ${hl} niet wederzijds (${doel} wijst niet terug)`);
  }
  // Bestaat dezelfde pagina indexeerbaar in een andere taal, dan moet die ook in de hreflang staan.
  for (const t2 of Object.keys(TALEN)) {
    const ander = t2 === 'nl' ? nlPad : `/${t2}${nlPad}`;
    const ap = paginas.get(ander);
    if (ap && !ap.noindex && !p.hreflang.has(t2)) fouten.push(`${pad}: hreflang ${t2} ontbreekt terwijl ${ander} bestaat`);
  }
}
for (const [t, ps] of titels) if (ps.length > 1) fouten.push(`dubbele title "${t}": ${ps.join(', ')}`);
for (const [, ps] of beschr) if (ps.length > 1) fouten.push(`dubbele description: ${ps.join(', ')}`);

console.log(`${paginas.size} pagina's gecontroleerd: NL ${telling.nl}, DE ${telling.de} (${noindexTelling.de} noindex), EN ${telling.en} (${noindexTelling.en} noindex).`);
console.log(`${titels.size} unieke titles, ${beschr.size} unieke descriptions (indexeerbare pagina's, alle talen samen).`);
if (fouten.length) { console.log(`\n${fouten.length} probleem/problemen:`); for (const f of fouten.slice(0, 80)) console.log('  ' + f); process.exit(1); }
console.log('Geen SEO-problemen gevonden.');
