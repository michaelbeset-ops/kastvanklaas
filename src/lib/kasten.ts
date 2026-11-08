import { getCollection, type CollectionEntry } from 'astro:content';
import { marked } from 'marked';
import { SITE, zaak, tijden } from './site';
import { type Taal, lp, euroT, CATEGORIE_T, UI } from './i18n';
import { heeftTaal } from './vertalingen.mjs';

type Data = CollectionEntry<'kasten'>['data'];
/** Wat er in de gekozen taal getoond wordt. naam/omschrijving/fotos op de kast zelf blijven altijd Nederlands
 *  (daar draait alle logica op: soorten, vitrinekasten, sortering), zodat elke taal precies dezelfde kasten toont. */
export type Toon = { taal: Taal; naam: string; omschrijving: string; fotos: { src: Data['fotos'][number]['src']; alt: string }[]; vertaald: boolean };
export type Kast = Data & { toon: Toon };

// Exact het oude WooCommerce-pad, zodat Google-posities en oude links blijven werken. Zonder taal: het Nederlandse pad.
export const padVan = (k: Data, taal: Taal = 'nl') => lp(taal, `/webshop/${k.categorie}/${k.slug}/`);

const naarHtml = (s: string) => (s.trim().startsWith('<') ? s : (marked.parse(s, { async: false }) as string));

// Naam zonder kastnummer, voor onder het grote nummer. Woorden blijven die van Klaas (of de vertaling daarvan).
export function label(k: Kast) {
  let s = k.toon.naam;
  if (k.code) s = s.replace(new RegExp(k.code.split('').join('\\s?-?\\s?'), 'i'), '');
  s = s.replace(/\b(Nr|No)\.?\s*(?=,|$)/i, '').replace(/\s{2,}/g, ' ').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : CATEGORIE_T[k.toon.taal][k.categorie]?.naam ?? '';
}

export const isTeak = (k: Data) => /teak/i.test(k.naam + ' ' + k.omschrijving);

// Te koop eerst, dan de kasten zelf voor tafels en accessoires, dan nieuwste eerst (hoger WooCommerce-id = later toegevoegd).
const gewicht = (k: Data) => (k.categorie === 'india-kasten' ? 0 : 1);
// Kasten uit het CMS hebben een datum en zijn altijd nieuwer dan de geimporteerde (die hebben alleen een volgnummer).
const nieuw = (k: Data) => (k.toegevoegd ? Date.parse(k.toegevoegd) || 0 : 0);
export const sorteer = (a: Data, b: Data) =>
  (a.status === b.status ? 0 : a.status === 'te-koop' ? -1 : 1) || gewicht(a) - gewicht(b) || nieuw(b) - nieuw(a) || b.volgorde - a.volgorde;

const cache = new Map<Taal, Promise<Kast[]>>();
export function alleKasten(taal: Taal = 'nl') {
  if (!cache.has(taal)) cache.set(taal, laad(taal));
  return cache.get(taal)!;
}
async function laad(taal: Taal): Promise<Kast[]> {
  const vert = new Map((await getCollection('vertalingen')).map((e) => [e.data.slug, e.data]));
  return (await getCollection('kasten'))
    .map((e) => {
      const k = e.data;
      // Geimporteerde teksten zijn HTML, teksten uit het CMS zijn Markdown.
      const omschrijving = naarHtml(k.omschrijving);
      const v = vert.get(k.slug);
      const t = taal === 'nl' ? null : v?.[taal];
      const vertaald = taal === 'nl' || heeftTaal(k, v, taal);
      const toon: Toon = {
        taal,
        vertaald,
        naam: vertaald && t ? t.naam : k.naam,
        omschrijving: vertaald && t ? naarHtml(t.omschrijving) : omschrijving,
        // Alt-tekst per foto via de Nederlandse alt; nieuwe foto zonder vertaling: de Nederlandse alt.
        fotos: k.fotos.map((f) => ({ src: f.src, alt: (vertaald && t?.alt[f.alt]) || f.alt })),
      };
      return { ...k, omschrijving, categorieen: [...new Set([k.categorie, ...k.categorieen])], toon };
    })
    .sort(sorteer);
}

export const prijsTekst = (k: Kast, taal: Taal = k.toon.taal) =>
  k.status === 'verkocht' ? UI[taal].verkocht : k.prijs ? euroT(k.prijs, taal) : UI[taal].prijsOpAanvraag;

// ---------- SEO ----------
const kort = (s: string, n: number) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,.;:]$/, '') + '…');
export const platteTekst = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Herkomst en hout per taal. "Elders" (Frans, Engels, Hollands) en teak bepalen we op de Nederlandse tekst.
const SEO = {
  nl: { uitIndia: ' uit India', teakIndia: ', teakhout uit India', vanTeak: 'van teakhout uit India', india: 'uit India', merk: ' | Kast van Klaas Leiden',
    verkocht: 'Verkocht. Zoek je zo\'n kast? Vraag Klaas wat er binnenkomt.', voor: (p: string) => `Te koop voor ${p}.`, aanvraag: 'Te koop, prijs op aanvraag.',
    zien: 'Te zien bij Kast van Klaas, Kaasmarkt Leiden.', foto: 'foto', inspiratie: 'Inspiratie',
    uitWinkel: (n: string) => `${n} uit de winkel van Kast van Klaas op de Kaasmarkt in Leiden`, fotoUitWinkel: 'Uit de winkel, foto' },
  de: { uitIndia: ' aus Indien', teakIndia: ', Teakholz aus Indien', vanTeak: 'aus Teakholz aus Indien', india: 'aus Indien', merk: ' | Kast van Klaas Leiden',
    verkocht: 'Verkauft. Suchen Sie so einen Schrank? Fragen Sie Klaas, was neu hereinkommt.', voor: (p: string) => `Zu verkaufen für ${p}.`, aanvraag: 'Zu verkaufen, Preis auf Anfrage.',
    zien: 'Zu sehen bei Kast van Klaas, Kaasmarkt Leiden.', foto: 'Foto', inspiratie: 'Inspiration',
    uitWinkel: (n: string) => `${n} aus dem Laden von Kast van Klaas am Kaasmarkt in Leiden`, fotoUitWinkel: 'Aus dem Laden, Foto' },
  en: { uitIndia: ' from India', teakIndia: ', teak from India', vanTeak: 'in teak from India', india: 'from India', merk: ' | Kast van Klaas Leiden',
    verkocht: 'Sold. Looking for a cabinet like this? Ask Klaas what is coming in.', voor: (p: string) => `For sale at ${p}.`, aanvraag: 'For sale, price on request.',
    zien: 'On view at Kast van Klaas, Kaasmarkt, Leiden.', foto: 'photo', inspiratie: 'Inspiration',
    uitWinkel: (n: string) => `${n} from the Kast van Klaas shop on the Kaasmarkt in Leiden`, fotoUitWinkel: 'From the shop, photo' },
};
const INDIA = /india|indien|indisch|indiase|indiaas/i;

export function seoTitel(k: Kast) {
  const taal = k.toon.taal, s = SEO[taal];
  if (!k.naam) return `${s.fotoUitWinkel} ${k.id ?? k.slug}${s.merk}`;
  // Kortste variant die binnen 62 tekens (Google kapt rond 600 px af) past wint; kastnummer en "Leiden" blijven er altijd in.
  const naam = k.toon.naam.replace(/\s{2,}/g, ' ');
  // Niet elke kast komt uit India (bv. 6A6 is Frans): dan geen herkomst toevoegen.
  const elders = /frans|engels|hollands/i.test(k.naam);
  const india = INDIA.test(naam) || elders ? '' : s.uitIndia;
  const hout = isTeak(k) && !/teak/i.test(naam) && !elders ? s.teakIndia : india;
  const opties = [`${naam}${hout}${s.merk}`, `${naam}${india}${s.merk}`, `${naam}${s.merk}`];
  // Duits en Engels hebben langere woorden: eerst nog zonder "Leiden" proberen voordat de naam wordt ingekort.
  if (taal !== 'nl') opties.push(`${naam}${india} | Kast van Klaas`, `${naam} | Kast van Klaas`);
  const past = opties.find((t) => t.length <= 62);
  if (past) return past;
  const lab = label(k);
  const kop = k.code ? `${k.code} ${lab}` : lab;
  const max = 62 - s.merk.length;
  let kortKop = kop.length <= max ? kop : kop.slice(0, kop.lastIndexOf(' ', max)).replace(/[,\s]+$/, '');
  // Niet eindigen op een los voorzetsel of voegwoord ("Vitrinenschrank mit | ..."). Alleen DE/EN, NL blijft zoals het was.
  if (taal !== 'nl') while (/\s(mit|und|aus|von|für|in|im|am|with|and|from|for|of|in|the)$/i.test(kortKop)) kortKop = kortKop.replace(/[,\s]*\S+$/, '');
  return kortKop + s.merk;
}

export function seoBeschrijving(k: Kast) {
  const taal = k.toon.taal, s = SEO[taal];
  // Sfeerfoto's uit de oude winkel zijn geen product: geen prijs of status noemen.
  if (!k.naam || k.categorie === 'inspiratie' || k.categorie === 'nieuws-van-klaas') {
    const zin = platteTekst(k.toon.omschrijving);
    return kort(`${s.uitWinkel(k.toon.naam || s.inspiratie)}${zin ? `: ${zin}` : `, ${s.foto} ${k.id ?? k.slug}`}.`, 158);
  }
  const wat = [k.code, label(k)].filter(Boolean).join(' ');
  const hout = /frans|engels|hollands/i.test(k.naam) ? '' : isTeak(k) ? s.vanTeak : s.india;
  const status = k.status === 'verkocht' ? s.verkocht : k.prijs ? s.voor(euroT(k.prijs, taal)) : s.aanvraag;
  const zin = platteTekst(k.toon.omschrijving).split(/(?<=[.!?])\s/)[0] ?? '';
  const basis = `${wat}${hout ? ', ' + hout : ''}. ${status} ${s.zien}`;
  return kort(basis.length < 120 && zin ? `${basis} ${zin}` : basis, 158);
}

const MATERIAAL = { nl: 'Teakhout', de: 'Teakholz', en: 'Teak' };
export function productSchema(k: Kast, beelden: string[]) {
  const taal = k.toon.taal;
  const url = new URL(padVan(k, taal), SITE).href;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: k.toon.naam,
    ...(k.code ? { sku: k.code, mpn: k.code } : {}),
    url,
    image: beelden,
    description: platteTekst(k.toon.omschrijving) || k.toon.naam,
    category: CATEGORIE_T[taal][k.categorie]?.naam,
    ...(isTeak(k) ? { material: MATERIAAL[taal] } : {}),
    brand: { '@type': 'Brand', name: 'Kast van Klaas' },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'EUR',
      ...(k.prijs ? { price: k.prijs.toFixed(2) } : {}),
      availability: k.status === 'verkocht' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
      seller: { '@type': 'FurnitureStore', name: zaak.naam, '@id': `${SITE}/#winkel` },
    },
  };
}

export function kruimelSchema(stappen: { naam: string; pad: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: stappen.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.naam, item: new URL(s.pad, SITE).href })),
  };
}

const WINKEL_TEKST = {
  nl: `Winkel op de Kaasmarkt in Leiden met oude kasten en meubels uit India, 60 tot 100 jaar oud en van primair teakhout, door ${zaak.eigenaar} zelf uitgezocht.`,
  de: `Laden am Kaasmarkt in Leiden mit alten Schränken und Möbeln aus Indien, 60 bis 100 Jahre alt und aus Teakholz aus Primärwald, von ${zaak.eigenaar} selbst ausgesucht.`,
  en: `Shop on the Kaasmarkt in Leiden with old cabinets and furniture from India, 60 to 100 years old and made of old-growth teak, hand-picked by ${zaak.eigenaar}.`,
};
// priceRange uit de echte prijzen van wat nu te koop is (laagste tot hoogste).
export function winkelSchema(beeld: string, kasten: Data[] = [], taal: Taal = 'nl') {
  const prijzen = kasten.filter((k) => k.status === 'te-koop' && k.prijs).map((k) => k.prijs as number);
  return {
    '@context': 'https://schema.org',
    '@type': 'FurnitureStore',
    '@id': `${SITE}/#winkel`,
    name: zaak.naam,
    url: new URL(lp(taal, '/'), SITE).href,
    description: WINKEL_TEKST[taal],
    image: beeld,
    telephone: '+31626378480',
    email: zaak.email,
    founder: { '@type': 'Person', name: zaak.eigenaar },
    address: { '@type': 'PostalAddress', streetAddress: zaak.straat, postalCode: zaak.postcode.replace(' ', ''), addressLocality: zaak.plaats, addressCountry: 'NL' },
    geo: { '@type': 'GeoCoordinates', latitude: zaak.geo.lat, longitude: zaak.geo.lng },
    openingHoursSpecification: tijden.map((t) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${{ Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' }[t.kort]}`, opens: t.open, closes: t.dicht })),
    identifier: { '@type': 'PropertyValue', propertyID: 'KvK', value: zaak.kvk },
    ...(prijzen.length ? { priceRange: `${euroT(Math.min(...prijzen), 'nl')} - ${euroT(Math.max(...prijzen), 'nl')}`, currenciesAccepted: 'EUR' } : {}),
    sameAs: [zaak.google.link],
  };
}
