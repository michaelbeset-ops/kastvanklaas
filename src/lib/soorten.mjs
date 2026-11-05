// Landingspagina's per soort kast. Het pad is de oude tag-URL van WooCommerce (/webshop/tag/<slug>/), zodat die
// Google-waarde niet meer naar een doorverwijzing gaat maar naar een echte pagina met de juiste kasten.
// Een kast hoort erbij als hij de tag had, of als het woord in zijn naam staat.
import fs from 'node:fs';
import path from 'node:path';

/** @type {{tag:string,naam:string,meervoud:string,woord?:RegExp,pad?:string}[]} */
export const SOORTEN = [
  // Vitrinekasten hebben al een eigen oude landingspagina; de tag verwijst daarheen (zie redirects.mjs).
  { tag: 'vitrinekast', naam: 'Vitrinekast', meervoud: 'Vitrinekasten', woord: /vitrine/i, pad: '/vitrinekast-uit-india/' },
  { tag: 'boekenkast', naam: 'Boekenkast', meervoud: 'Boekenkasten', woord: /boekenkast/i },
  { tag: 'keukenkast', naam: 'Keukenkast', meervoud: 'Keukenkasten', woord: /keukenkast|servieskast/i },
  { tag: 'apothekerskast', naam: 'Apothekerskast', meervoud: 'Apothekerskasten', woord: /apotheek|apothekers/i },
  { tag: 'woonkamerkast', naam: 'Woonkamerkast', meervoud: 'Woonkamerkasten' },
  { tag: 'gangkast', naam: 'Gangkast', meervoud: 'Gangkasten' },
  { tag: 'badkamerkast', naam: 'Badkamerkast', meervoud: 'Badkamerkasten', woord: /badkamer/i },
  { tag: 'kinderkamerkast', naam: 'Kinderkamerkast', meervoud: 'Kinderkamerkasten', woord: /kinderkamer/i },
  { tag: 'studeerkamerkast', naam: 'Studeerkamerkast', meervoud: 'Studeerkamerkasten' },
  { tag: 'kantoorkast', naam: 'Kantoorkast', meervoud: 'Kantoorkasten' },
  { tag: 'oude-winkelkast', naam: 'Oude winkelkast', meervoud: 'Oude winkelkasten', woord: /winkelkast/i },
  { tag: 'vintage-kast', naam: 'Vintage kast', meervoud: 'Vintage kasten' },
  { tag: 'linnenkast', naam: 'Linnenkast', meervoud: 'Linnenkasten', woord: /linnenkast|kledingkast/i },
  { tag: 'tv-kast', naam: 'Tv-kast', meervoud: 'Tv-kasten', woord: /tv[ -]?(kast|meubel)|televisie/i },
  { tag: 'commode', naam: 'Commode', meervoud: 'Commodes', woord: /commode|side ?board|dressoir/i },
];

export const MINIMUM = 4; // minder kasten dan dit: geen eigen pagina, de oude tag-URL verwijst door

export const hoortBij = (s, k) => k.tags.includes(s.tag) || (s.woord?.test(k.naam) ?? false);
export const padSoort = (s) => s.pad ?? `/webshop/tag/${s.tag}/`;

// Welke soorten genoeg kasten hebben voor een eigen pagina. Leest de JSON-bestanden zelf, zodat ook
// astro.config en redirects.mjs (buiten Vite) het weten.
export function soortenMetPagina() {
  const dir = path.resolve(process.cwd(), 'src', 'content', 'kasten');
  const kasten = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter((k) => k.inCollectie !== false).map((k) => ({ tags: [], ...k }));
  return SOORTEN.filter((s) => !s.pad && kasten.filter((k) => hoortBij(s, k)).length >= MINIMUM);
}

// Chiplinks naar de soortpagina's (alleen soorten met een pagina). n = aantal dat nu te koop is, zodat het
// getal hetzelfde betekent als "Te koop (x)" erboven.
export function soortChips(kasten, echteTags) {
  return SOORTEN.filter((s) => s.pad || echteTags.has(s.tag))
    .map((s) => { const bij = kasten.filter((k) => hoortBij(s, k)); return { naam: s.meervoud, pad: padSoort(s), n: bij.filter((k) => k.status === 'te-koop').length, totaal: bij.length }; })
    .filter((c) => c.totaal > 0);
}
