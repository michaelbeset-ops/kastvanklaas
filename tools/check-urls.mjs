// Controleert of ELKE oude URL van kastvanklaas.nl in dist/ bestaat (als pagina of als doorverwijzing).
// Bron: de Yoast-sitemaps in klanten/kastvanklaas-import/*.xml plus de oude subcategorieen uit de crawl.
// Gebruik: npm run build && npm run check-urls   (exit 1 bij ook maar een ontbrekende URL)
import fs from 'node:fs';
import path from 'node:path';
import { redirectPaden } from '../src/lib/redirects.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const oud = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'oude-urls.json'), 'utf8'));

const groepen = {
  "pagina's": oud.paginas,
  posts: oud.posts,
  "categorieen": oud.categorieen,
  tags: oud.tags,
  producten: oud.producten,
  'oude subcategorieen': oud.crawlCategorieen,
};
const redirects = new Map(redirectPaden().map((r) => [r.van, r.naar]));
const bestaat = (p) => fs.existsSync(path.join(DIST, decodeURIComponent(p), 'index.html'));

let fout = 0;
const ontbreekt = [];
for (const [naam, lijst] of Object.entries(groepen)) {
  let ok = 0, door = 0;
  for (const p of lijst) {
    if (!bestaat(p)) { ontbreekt.push(`${naam}: ${p}`); fout++; continue; }
    if (redirects.has(p)) {
      door++;
      // Een doorverwijzing moet zelf op een bestaande pagina uitkomen, anders is het alsnog een 404.
      const naar = redirects.get(p);
      if (!bestaat(naar)) { ontbreekt.push(`${naam}: ${p} -> ${naar} (bestemming ontbreekt)`); fout++; }
    } else ok++;
  }
  console.log(`${naam.padEnd(20)} ${String(lijst.length).padStart(4)}  pagina ${String(ok).padStart(4)}  doorverwijzing ${String(door).padStart(4)}`);
}
if (fout) {
  console.log(`\n${fout} probleem/problemen:`);
  for (const r of ontbreekt) console.log('  ' + r);
  process.exit(1);
}
console.log('\nAlle oude URL\'s bestaan in dist/.');
