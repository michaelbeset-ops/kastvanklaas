// Eenmalige import van de oude WooCommerce-winkel naar de content collection.
// Bron: klanten/kastvanklaas-import/store*.json (Store API) + *.xml (Yoast-sitemaps).
// Draai opnieuw met `npm run import`; bestaande foto's worden niet opnieuw gedownload.
// Let op: na livegang is src/content/kasten de bron van waarheid (Klaas past daar via /beheer/ aan),
// dus dit script dan NIET meer draaien, anders overschrijft het zijn wijzigingen.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const IMPORT = path.resolve(ROOT, '..', 'kastvanklaas-import');
const BRON_IMG = path.join(ROOT, 'bron', 'img');
const CACHE = path.join(ROOT, 'bron', 'producten'); // ruwe downloads, grootste versie
const ASSETS = path.join(ROOT, 'src', 'assets', 'kasten');
const OUT = path.join(ROOT, 'src', 'content', 'kasten');
const DATA = path.join(ROOT, 'src', 'data');
for (const d of [CACHE, ASSETS, OUT, DATA]) fs.mkdirSync(d, { recursive: true });

const all = ['store.json', 'store2.json', 'store3.json'].flatMap((f) =>
  JSON.parse(fs.readFileSync(path.join(IMPORT, f), 'utf8')),
);

// ---------- tekst ----------
const ENT = { '&#8211;': '–', '&#8212;': '—', '&#8220;': '“', '&#8221;': '”', '&#8216;': '‘', '&#8217;': '’', '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#038;': '&', '&euro;': '€', '&#8230;': '…' };
const decode = (s) => s.replace(/&#?\w+;/g, (m) => ENT[m] ?? m);

// Kastnummer volgens Klaas' systeem (20B5 = kast 20, levering B, jaar 5). Ook oudere vormen: N011, LH12, R13, 1LH3.
function kastnummer(name, slug) {
  const n = decode(name);
  let m = n.match(/(?<!\d)(\d{1,2})\s?-?\s?(ANS|ALH|LH|A|B)\s?-?\s?(\d{1,2})\b/i);
  if (m) return (m[1] + m[2] + m[3]).toUpperCase();
  m = n.match(/\b(LH|N|R)(\d{1,3})\b/);
  if (m) return m[1] + m[2];
  m = slug.match(/(?:^|-)(?:nr-?)?(\d{1,2})-?(ans|alh|lh|a|b)-?(\d{1,2})(?:-|$)/);
  if (m) return (m[1] + m[2] + m[3]).toUpperCase();
  m = slug.match(/nr-(\d{1,2})-b$/);
  if (m) return m[1] + 'B';
  return null;
}

// Naam: entiteiten weg, gedachtestreepjes als komma, rommel aan de randen weg. Woorden zelf blijven van Klaas.
function schoneNaam(name) {
  let s = decode(name).replace(/\s+[–—]\s+/g, ', ').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/\s*\|\s*/g, ', ').replace(/[\s,–—-]+$/g, '').replace(/^[\s,–—-]+/g, '');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

// Beschrijving opschonen: Divi-shortcodes, data-attributen, inline afbeeldingen en lege alinea's weg.
function schoneHtml(html) {
  if (!html) return '';
  let h = html
    .replace(/\[\/?[a-z_]+[^\]]*\]/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\s(?:data-[\w-]+|class|style|id|dir|lang|width|height|align)="[^"]*"/gi, '')
    .replace(/<\/?(?:span|div|font)[^>]*>/gi, '')
    .replace(/<(\/?)h[1-6]>/gi, '<$1p>') // koppen uit WordPress zijn opgemaakte tekst, geen documentstructuur
    .replace(/href="https?:\/\/(?:www\.)?kastvanklaas\.nl/gi, 'href="')
    .replace(/&nbsp;/g, ' ');
  h = h.replace(/<p>(?:\s|<br\s*\/?>)*<\/p>/gi, '').replace(/<li>\s*<\/li>/gi, '').replace(/<ul>\s*<\/ul>/gi, '');
  h = h.replace(/\n{2,}/g, '\n').trim();
  return h;
}
const tekst = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Maten alleen als ze letterlijk ergens staan. Volgorde: WooCommerce-attribuut "maten", losse alinea met
// alleen maten (bv. "166cmx35cmx49cm"), of een regel die begint met "Afmeting(en)" / "De maten van ...".
function maten(p, html) {
  const attr = p.attributes.find((a) => /^maten?$/i.test(a.name));
  const t = attr?.terms?.[0]?.name;
  if (t && /\d/.test(t)) return { maten: decode(t).trim(), html };
  const los = html.match(/<p>\s*(\d{2,3}\s?cm\s?x\s?\d{2,3}\s?(?:cm)?\s?x\s?\d{2,3}\s?cm)\s*<\/p>/i);
  if (los) return { maten: los[1].trim(), html: html.replace(los[0], '') };
  const plain = decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li)>/gi, '\n').replace(/<[^>]+>/g, ''));
  const regel = plain.split('\n').map((r) => r.trim()).find((r) => /^(afmetingen?|de maten van[^:]*)\s*:/i.test(r) && /\d/.test(r));
  if (regel) return { maten: regel.replace(/^(afmetingen?|de maten van[^:]*)\s*:\s*/i, '').trim(), html };
  return { maten: null, html };
}

// ---------- categorie ----------
const CAT_NAAM = {
  'india-kasten': 'India kasten',
  'indiase-tafels': 'Indiase tafels',
  accessoires: 'Meer uit India',
  tuinmeubels: 'Tuinmeubels',
  inspiratie: 'Inspiratie',
  joosjedoodles: 'Joosje Doodles',
  'nieuws-van-klaas': 'Nieuws van Klaas',
};

// ---------- foto's ----------
const bezig = new Map(); // zelfde foto hangt soms aan twee producten: niet dubbel tegelijk schrijven
function haalFoto(url) {
  if (!bezig.has(url)) bezig.set(url, haalFotoEcht(url));
  return bezig.get(url);
}
async function haalFotoEcht(url) {
  const m = url.match(/uploads\/(\d{4})\/(\d\d)\/(.+)$/);
  const naam = `${m[1]}_${m[2]}_${decodeURIComponent(m[3])}`;
  let bron = path.join(BRON_IMG, naam);
  if (!fs.existsSync(bron)) {
    bron = path.join(CACHE, naam);
    if (!fs.existsSync(bron)) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      fs.writeFileSync(bron, Buffer.from(await r.arrayBuffer()));
    }
  }
  // Voorverkleinen tot 1800px: Astro maakt hier later webp/avif-srcsets van. Scheelt bouwtijd en geheugen.
  const doel = path.join(ASSETS, naam.replace(/\.(png|jpe?g|webp)$/i, '.jpg'));
  if (!fs.existsSync(doel)) {
    await sharp(bron).rotate().resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toFile(doel);
  }
  return path.basename(doel);
}
const AANZICHT = [['voorkant', 'voorkant'], ['zijkant', 'zijkant'], ['open', 'open'], ['schuin', 'schuin van voren'], ['van-boven', 'van boven']];

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ---------- producten ----------
const JOOSJE_MEUBEL = /kast|tafel|kookeiland|lamp|rek/i;
const permalink = (p) => new URL(p.permalink).pathname;
const urlCat = (p) => permalink(p).split('/')[2];

// Dubbele invoer in de oude winkel (zelfde kastnummer in twee categorieen): beide pagina's blijven bestaan
// voor Google, maar in de collectie tonen we er maar een. Voorkeur: die met prijs, anders de tafel-categorie.
const perCode = {};
for (const p of all) { const c = kastnummer(p.name, p.slug); if (c) (perCode[c] ??= []).push(p); }
const verborgen = new Set();
for (const lijst of Object.values(perCode)) {
  if (lijst.length < 2) continue;
  const gesorteerd = [...lijst].sort((a, b) => (+b.prices.price - +a.prices.price) || (urlCat(a) === 'indiase-tafels' ? -1 : 1));
  gesorteerd.slice(1).forEach((p) => verborgen.add(p.id));
}

for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));
let i = 0;
await pool(all, 4, async (p) => {
  const code = kastnummer(p.name, p.slug);
  const naam = schoneNaam(p.name);
  let html = [schoneHtml(p.short_description), schoneHtml(p.description)].filter(Boolean);
  if (html.length === 2 && tekst(html[0]) === tekst(html[1])) html = [html[0]];
  const m = maten(p, html.join('\n'));
  const cat = urlCat(p);
  const cats = [...new Set([cat, ...p.categories.map((c) => c.slug)])];
  const label = naam.replace(code ?? '§', '').replace(/^\s*nr\.?\s*/i, '').replace(/\bNr\.?\s*$/i, '').replace(/\s{2,}/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '');
  const fotos = await pool(p.images, 2, async (img, k) => {
    const file = await haalFoto(img.src);
    const aanzicht = AANZICHT.find(([w]) => img.src.toLowerCase().includes(w))?.[1];
    const wie = [code, label || CAT_NAAM[cat]].filter(Boolean).join(' ');
    const alt = cat === 'inspiratie' ? `Inspiratie uit de winkel van Kast van Klaas in Leiden, foto ${k + 1}`
      : `${wie}${aanzicht ? `, ${aanzicht}` : `, foto ${k + 1}`}`;
    return { src: `../../assets/kasten/${file}`, alt };
  });
  const prijs = +p.prices.price > 0 ? +p.prices.price / 100 : null;
  const doc = {
    id: p.id,
    code,
    naam,
    slug: p.slug,
    categorie: cat,
    categorieen: cats,
    status: p.is_in_stock ? 'te-koop' : 'verkocht',
    prijs,
    maten: m.maten,
    omschrijving: m.html.trim(),
    fotos,
    tags: p.tags.map((t) => t.slug),
    // In de oude winkel staan ook meubels in de categorie JoosjeDoodles; die horen gewoon in de collectie, de illustraties niet.
    inCollectie: !verborgen.has(p.id) && !['inspiratie', 'nieuws-van-klaas'].includes(cat) && !(cat === 'joosjedoodles' && !JOOSJE_MEUBEL.test(naam)),
    volgorde: p.id,
  };
  fs.writeFileSync(path.join(OUT, `${p.slug}.json`), JSON.stringify(doc, null, 2) + '\n');
  if (++i % 20 === 0) console.log(`${i}/${all.length}`);
});

// ---------- oude URL's ----------
const locs = (f) => [...fs.readFileSync(path.join(IMPORT, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((x) => x[1]).filter((u) => !u.includes('/wp-content/')).map((u) => new URL(u).pathname);
const tagLinks = {};
for (const p of all) for (const t of p.tags) (tagLinks[t.slug] ??= { naam: decode(t.name), cats: {} }).cats[urlCat(p)] = (tagLinks[t.slug].cats[urlCat(p)] ?? 0) + 1;
const crawlCats = fs.readdirSync(path.join(ROOT, 'bron', 'site')).filter((f) => f.startsWith('webshop__cat__') && !f.includes('__page__'))
  .map((f) => '/' + f.replace('.txt', '').split('__').join('/') + '/');
const oud = {
  paginas: locs('page.xml'),
  posts: locs('post.xml'),
  categorieen: locs('product_cat.xml'),
  tags: locs('product_tag.xml'),
  producten: locs('product.xml'),
  crawlCategorieen: crawlCats,
  tagInfo: tagLinks,
};
fs.writeFileSync(path.join(DATA, 'oude-urls.json'), JSON.stringify(oud, null, 2) + '\n');

const teKoop = all.filter((p) => p.is_in_stock).length;
console.log(`Klaar: ${all.length} producten, ${teKoop} te koop, ${all.length - teKoop} verkocht, ${verborgen.size} dubbel verborgen.`);
