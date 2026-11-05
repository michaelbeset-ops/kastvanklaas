import { getCollection, type CollectionEntry } from 'astro:content';
import { marked } from 'marked';
import { CATEGORIE, SITE, euro, zaak, tijden } from './site';

export type Kast = CollectionEntry<'kasten'>['data'];

// Exact het oude WooCommerce-pad, zodat Google-posities en oude links blijven werken.
export const padVan = (k: Kast) => `/webshop/${k.categorie}/${k.slug}/`;

// Naam zonder kastnummer, voor onder het grote nummer. Woorden blijven die van Klaas.
export function label(k: Kast) {
  let s = k.naam;
  if (k.code) s = s.replace(new RegExp(k.code.split('').join('\\s?-?\\s?'), 'i'), '');
  s = s.replace(/\bNr\.?\s*(?=,|$)/i, '').replace(/\s{2,}/g, ' ').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : CATEGORIE[k.categorie]?.naam ?? '';
}

export const isTeak = (k: Kast) => /teak/i.test(k.naam + ' ' + k.omschrijving);

// Te koop eerst, dan de kasten zelf voor tafels en accessoires, dan nieuwste eerst (hoger WooCommerce-id = later toegevoegd).
const gewicht = (k: Kast) => (k.categorie === 'india-kasten' ? 0 : 1);
// Kasten uit het CMS hebben een datum en zijn altijd nieuwer dan de geimporteerde (die hebben alleen een volgnummer).
const nieuw = (k: Kast) => (k.toegevoegd ? Date.parse(k.toegevoegd) || 0 : 0);
export const sorteer = (a: Kast, b: Kast) =>
  (a.status === b.status ? 0 : a.status === 'te-koop' ? -1 : 1) || gewicht(a) - gewicht(b) || nieuw(b) - nieuw(a) || b.volgorde - a.volgorde;

export async function alleKasten() {
  return (await getCollection('kasten'))
    .map((e) => {
      const k = e.data;
      // Geimporteerde teksten zijn HTML, teksten uit het CMS zijn Markdown.
      const omschrijving = k.omschrijving.trim().startsWith('<') ? k.omschrijving : (marked.parse(k.omschrijving, { async: false }) as string);
      return { ...k, omschrijving, categorieen: [...new Set([k.categorie, ...k.categorieen])] };
    })
    .sort(sorteer);
}

export const prijsTekst = (k: Kast) => (k.status === 'verkocht' ? 'Verkocht' : k.prijs ? euro(k.prijs) : 'Prijs op aanvraag');

// ---------- SEO ----------
const kort = (s: string, n: number) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,.;:]$/, '') + '…');
const platteTekst = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export function seoTitel(k: Kast) {
  if (!k.naam) return `Uit de winkel, foto ${k.id ?? k.slug} | Kast van Klaas Leiden`;
  // Kortste variant die binnen 62 tekens (Google kapt rond 600 px af) past wint; kastnummer en "Leiden" blijven er altijd in.
  const naam = k.naam.replace(/\s{2,}/g, ' ');
  const hout = isTeak(k) && !/teak/i.test(naam) ? ', teakhout uit India' : /india/i.test(naam) ? '' : ' uit India';
  const opties = [
    `${naam}${hout} | Kast van Klaas Leiden`,
    `${naam}${/india/i.test(naam) ? '' : ' uit India'} | Kast van Klaas Leiden`,
    `${naam} | Kast van Klaas Leiden`,
  ];
  const past = opties.find((t) => t.length <= 62);
  if (past) return past;
  const rest = ' | Kast van Klaas Leiden';
  const lab = label(k);
  const kop = k.code ? `${k.code} ${lab}` : lab;
  const max = 62 - rest.length;
  return (kop.length <= max ? kop : kop.slice(0, kop.lastIndexOf(' ', max)).replace(/[,\s]+$/, '')) + rest;
}

export function seoBeschrijving(k: Kast) {
  // Sfeerfoto's uit de oude winkel zijn geen product: geen prijs of status noemen.
  if (!k.naam || k.categorie === 'inspiratie' || k.categorie === 'nieuws-van-klaas') {
    const zin = platteTekst(k.omschrijving);
    return kort(`${k.naam || 'Inspiratie'} uit de winkel van Kast van Klaas op de Kaasmarkt in Leiden${zin ? `: ${zin}` : `, foto ${k.id ?? k.slug}`}.`, 158);
  }
  const wat = [k.code, label(k)].filter(Boolean).join(' ');
  const hout = isTeak(k) ? 'van teakhout uit India' : 'uit India';
  const status = k.status === 'verkocht'
    ? 'Verkocht. Zoek je zo\'n kast? Vraag Klaas wat er binnenkomt.'
    : k.prijs ? `Te koop voor ${euro(k.prijs)}.` : 'Te koop, prijs op aanvraag.';
  const zin = platteTekst(k.omschrijving).split(/(?<=[.!?])\s/)[0] ?? '';
  const basis = `${wat}, ${hout}. ${status} Te zien bij Kast van Klaas, Kaasmarkt Leiden.`;
  return kort(basis.length < 120 && zin ? `${basis} ${zin}` : basis, 158);
}

export function productSchema(k: Kast, beelden: string[]) {
  const url = new URL(padVan(k), SITE).href;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: k.naam,
    ...(k.code ? { sku: k.code, mpn: k.code } : {}),
    url,
    image: beelden,
    description: platteTekst(k.omschrijving) || k.naam,
    category: CATEGORIE[k.categorie]?.naam,
    ...(isTeak(k) ? { material: 'Teakhout' } : {}),
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

// priceRange uit de echte prijzen van wat nu te koop is (laagste tot hoogste).
export function winkelSchema(beeld: string, kasten: Kast[] = []) {
  const prijzen = kasten.filter((k) => k.status === 'te-koop' && k.prijs).map((k) => k.prijs as number);
  return {
    '@context': 'https://schema.org',
    '@type': 'FurnitureStore',
    '@id': `${SITE}/#winkel`,
    name: zaak.naam,
    url: `${SITE}/`,
    description: `Winkel op de Kaasmarkt in Leiden met oude kasten en meubels uit India, 60 tot 100 jaar oud en van primair teakhout, door ${zaak.eigenaar} zelf uitgezocht.`,
    image: beeld,
    telephone: '+31626378480',
    email: zaak.email,
    founder: { '@type': 'Person', name: zaak.eigenaar },
    address: { '@type': 'PostalAddress', streetAddress: zaak.straat, postalCode: zaak.postcode.replace(' ', ''), addressLocality: zaak.plaats, addressCountry: 'NL' },
    geo: { '@type': 'GeoCoordinates', latitude: zaak.geo.lat, longitude: zaak.geo.lng },
    openingHoursSpecification: tijden.map((t) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: `https://schema.org/${{ Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday' }[t.kort]}`, opens: t.open, closes: t.dicht })),
    identifier: { '@type': 'PropertyValue', propertyID: 'KvK', value: zaak.kvk },
    ...(prijzen.length ? { priceRange: `${euro(Math.min(...prijzen))} - ${euro(Math.max(...prijzen))}`, currenciesAccepted: 'EUR' } : {}),
    sameAs: [zaak.google.link],
  };
}
