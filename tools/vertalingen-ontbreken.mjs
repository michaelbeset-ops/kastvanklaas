// Welke kasten hebben nog geen Duitse of Engelse tekst, of een vertaling van een oudere Nederlandse tekst?
// Gebruik: npm run vertalingen-ontbreken
// Ontbreekt een vertaling, dan toont de DE/EN-pagina de Nederlandse tekst, staat hij op noindex en zit hij niet in de sitemap.
// Vertalen: maak of vul src/content/vertalingen/<slug>.json (zelfde opbouw als de bestaande) en zet "bron" op de waarde hieronder.
import { vertaalStatus, bronHash } from '../src/lib/vertalingen.mjs';
import fs from 'node:fs';
import path from 'node:path';

const { rijen, wees } = vertaalStatus();
const lijst = (st) => rijen.filter((r) => r.de === st || r.en === st);
const regel = (r) => {
  const k = JSON.parse(fs.readFileSync(path.resolve('src/content/kasten', `${r.slug}.json`), 'utf8'));
  const talen = ['de', 'en'].filter((t) => r[t] !== 'ok').join('+');
  return `  ${(r.code || '-').padEnd(7)} ${talen.padEnd(6)} ${r.slug}  (bron: ${bronHash(k)})`;
};

const ontbreekt = lijst('ontbreekt');
const verouderd = lijst('verouderd').filter((r) => !ontbreekt.includes(r));
console.log(`${rijen.length} kasten. Volledig vertaald (DE en EN): ${rijen.filter((r) => r.de === 'ok' && r.en === 'ok').length}.`);
console.log(`\nZonder vertaling (${ontbreekt.length}): DE/EN-pagina toont Nederlandse tekst, noindex, niet in de sitemap.`);
for (const r of ontbreekt) console.log(regel(r));
console.log(`\nNederlandse tekst gewijzigd na vertalen (${verouderd.length}): vertaling staat nog online, even nakijken.`);
for (const r of verouderd) console.log(regel(r));
if (wees.length) {
  console.log(`\nVertaalbestanden zonder kast (${wees.length}), kunnen weg:`);
  for (const s of wees) console.log('  ' + s);
}
