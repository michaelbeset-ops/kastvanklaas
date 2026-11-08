// Gedeeld door de build (astro.config: sitemap), de pagina's en tools/vertalingen-ontbreken.mjs.
// Leest de bestanden zelf van schijf (via cwd), zodat het ook buiten Vite werkt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KASTEN = path.resolve(process.cwd(), 'src', 'content', 'kasten');
const VERTALINGEN = path.resolve(process.cwd(), 'src', 'content', 'vertalingen');

/** Vingerafdruk van de Nederlandse naam en tekst. Verandert Klaas iets, dan klopt hij niet meer met de vertaling. */
export const bronHash = (k) => crypto.createHash('sha1').update(`${k.naam ?? ''}\n${k.omschrijving ?? ''}`).digest('hex').slice(0, 12);

/** Telt een taal als vertaald? Er moet een vertaalde naam zijn als de kast een naam heeft. */
export const heeftTaal = (k, v, taal) => {
  const t = v?.[taal];
  if (!t) return false;
  if ((k.naam ?? '').trim() && !(t.naam ?? '').trim()) return false;
  if ((k.omschrijving ?? '').trim() && !(t.omschrijving ?? '').trim()) return false;
  return true;
};

const lees = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [])
  .map((f) => ({ bestand: f, data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));

/** Status per kast en per taal: 'ok', 'verouderd' (Nederlandse tekst gewijzigd na vertalen) of 'ontbreekt'. */
export function vertaalStatus() {
  const vert = new Map(lees(VERTALINGEN).map(({ data }) => [data.slug, data]));
  const kasten = lees(KASTEN).map(({ data }) => data);
  const slugs = new Set(kasten.map((k) => k.slug));
  const rijen = kasten.map((k) => {
    const v = vert.get(k.slug);
    const st = {};
    for (const taal of ['de', 'en']) st[taal] = !heeftTaal(k, v, taal) ? 'ontbreekt' : v.bron !== bronHash(k) ? 'verouderd' : 'ok';
    return { slug: k.slug, code: k.code ?? '', naam: k.naam, pad: `/webshop/${k.categorie}/${k.slug}/`, ...st };
  });
  const wees = [...vert.keys()].filter((s) => !slugs.has(s));
  return { rijen, wees };
}

/** Paden van DE/EN-kastpagina's zonder vertaling: die staan op noindex en horen niet in de sitemap. */
export function onvertaaldePaden() {
  const uit = new Set();
  for (const r of vertaalStatus().rijen) for (const taal of ['de', 'en']) if (r[taal] === 'ontbreekt') uit.add(`/${taal}${r.pad}`);
  return uit;
}
