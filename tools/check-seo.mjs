// SEO-controle op dist/: elke echte pagina heeft een unieke title en meta description, een canonical op www,
// een og:image, precies een h1, en alt-tekst op elke afbeelding. Doorverwijspagina's worden overgeslagen.
// Gebruik: npm run build && npm run check-seo   (exit 1 bij een probleem)
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const paginas = [];
(function loop(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'beheer' && f !== '_astro') loop(p); }
    else if (f === 'index.html') paginas.push(p);
  }
})(DIST);

const titels = new Map(), beschr = new Map(), fouten = [];
let echt = 0;
for (const p of paginas) {
  const h = fs.readFileSync(p, 'utf8');
  if (h.includes('http-equiv="refresh"')) continue;
  echt++;
  const pad = '/' + path.relative(DIST, path.dirname(p)).split(path.sep).join('/') + '/';
  const t = h.match(/<title>([^<]*)<\/title>/)?.[1];
  const d = h.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const c = h.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (!t) fouten.push(`${pad}: geen title`); else (titels.get(t) ?? titels.set(t, []).get(t)).push(pad);
  if (!d) fouten.push(`${pad}: geen description`); else (beschr.get(d) ?? beschr.set(d, []).get(d)).push(pad);
  if (t && t.length > 70) fouten.push(`${pad}: title ${t.length} tekens (max 70)`);
  if (d && (d.length < 70 || d.length > 160)) fouten.push(`${pad}: description ${d.length} tekens`);
  if (!c?.startsWith('https://www.kastvanklaas.nl/')) fouten.push(`${pad}: canonical ontbreekt of niet op www`);
  if (!/<meta property="og:image" content="https:\/\//.test(h)) fouten.push(`${pad}: geen absolute og:image`);
  const h1 = (h.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) fouten.push(`${pad}: ${h1} h1's`);
  for (const img of h.match(/<img [^>]*>/g) ?? []) if (!/\salt(=|\s|>)/.test(img)) fouten.push(`${pad}: afbeelding zonder alt`);
}
for (const [t, ps] of titels) if (ps.length > 1) fouten.push(`dubbele title "${t}": ${ps.join(', ')}`);
for (const [d, ps] of beschr) if (ps.length > 1) fouten.push(`dubbele description: ${ps.join(', ')}`);

console.log(`${echt} pagina's gecontroleerd, ${titels.size} unieke titles, ${beschr.size} unieke descriptions.`);
if (fouten.length) { console.log(`\n${fouten.length} probleem/problemen:`); for (const f of fouten.slice(0, 80)) console.log('  ' + f); process.exit(1); }
console.log('Geen SEO-problemen gevonden.');
