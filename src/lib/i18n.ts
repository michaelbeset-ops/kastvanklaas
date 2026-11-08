// Talen van de site. Nederlands staat op de root (alle oude URL's blijven gelijk), Duits onder /de/, Engels onder /en/.
// Zelfde padstructuur en zelfde kast-slugs in elke taal: de taalwisselaar zet alleen het voorvoegsel ervoor.
// Geen automatische doorverwijzing op browsertaal (slecht voor Google); de bezoeker kiest zelf.
export type Taal = 'nl' | 'de' | 'en';
export const TALEN: Taal[] = ['nl', 'de', 'en'];
export const ANDERE_TALEN: Taal[] = ['de', 'en'];

export const TAAL_INFO: Record<Taal, { html: string; og: string; naam: string; kort: string; locale: string; schema: string; mailNaam: string }> = {
  nl: { html: 'nl', og: 'nl_NL', naam: 'Nederlands', kort: 'NL', locale: 'nl-NL', schema: 'nl-NL', mailNaam: 'Nederlands' },
  de: { html: 'de', og: 'de_DE', naam: 'Deutsch', kort: 'DE', locale: 'de-DE', schema: 'de-DE', mailNaam: 'Duits' },
  en: { html: 'en', og: 'en_GB', naam: 'English', kort: 'EN', locale: 'en-GB', schema: 'en-GB', mailNaam: 'Engels' },
};

/** Pad in een taal: lp('de', '/contact/') = '/de/contact/'. Het pad is altijd het Nederlandse (root-)pad. */
export const lp = (taal: Taal, pad: string) => (taal === 'nl' ? pad : `/${taal}${pad}`);

/** Taal uit een URL-pad halen (voor componenten zonder taal-prop). */
export const taalVanPad = (pathname: string): Taal => {
  const m = pathname.match(/^\/(de|en)(\/|$)/);
  return (m ? m[1] : 'nl') as Taal;
};
/** Het Nederlandse pad bij een (eventueel vertaald) pad. */
export const basisPad = (pathname: string) => pathname.replace(/^\/(de|en)(?=\/|$)/, '') || '/';

// ---------- Getallen en prijzen ----------
export function euroT(n: number, taal: Taal) {
  const opts = { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 };
  if (taal === 'de') return `${n.toLocaleString('de-DE', opts)} €`;
  if (taal === 'en') return `€${n.toLocaleString('en-GB', opts)}`;
  return '€ ' + n.toLocaleString('nl-NL', opts);
}
export const tijdT = (t: string, taal: Taal) => (taal === 'nl' ? t.replace(':', '.') : t);

// Maten zoals Klaas ze schrijft (L = lengte, B = breedte, D = diepte, H = hoogte) met de letters in de andere taal.
// Getallen en "cm" blijven staan; alleen losse letters en de uitgeschreven woorden worden vertaald.
export function matenT(m: string, taal: Taal) {
  if (taal === 'nl') return m;
  const map: Record<string, Record<string, string>> = {
    de: { l: 'L', b: 'B', d: 'T', h: 'H', lengte: 'Länge', breedte: 'Breite', diepte: 'Tiefe', hoogte: 'Höhe' },
    en: { l: 'L', b: 'W', d: 'D', h: 'H', lengte: 'length', breedte: 'width', diepte: 'depth', hoogte: 'height' },
  };
  return m.replace(/\b(lengte|breedte|diepte|hoogte)\b/gi, (w) => map[taal][w.toLowerCase()])
    .replace(/(^|[\s\d.x–-])([lbdh])(?=[\s\d.]|$)/gi, (_, voor, l) => voor + map[taal][l.toLowerCase()]);
}

// ---------- Categorieen ----------
type CatTekst = { naam: string; kort: string; over: string; verkocht: string; alle: string };
export const CATEGORIE_T: Record<Taal, Record<string, CatTekst>> = {
  nl: {
    'india-kasten': { naam: 'India kasten', kort: 'Kasten', over: 'Over deze kast', verkocht: 'Deze kast is verkocht.', alle: 'Alle India kasten' },
    'indiase-tafels': { naam: 'Indiase tafels', kort: 'Tafels', over: 'Over deze tafel', verkocht: 'Deze tafel is verkocht.', alle: 'Alle Indiase tafels' },
    accessoires: { naam: 'Meer uit India', kort: 'Meer uit India', over: 'Over dit stuk', verkocht: 'Dit stuk is verkocht.', alle: 'Meer uit India' },
    tuinmeubels: { naam: 'Tuinmeubels', kort: 'Tuinmeubels', over: 'Over deze tuinmeubel', verkocht: 'Deze tuinmeubel is verkocht.', alle: 'Alle tuinmeubels' },
    inspiratie: { naam: 'Inspiratie', kort: 'Inspiratie', over: 'Over deze foto', verkocht: 'Deze foto is verkocht.', alle: 'Alle inspiratie' },
    joosjedoodles: { naam: 'Joosje Doodles', kort: 'Joosje Doodles', over: 'Over dit werk', verkocht: 'Dit werk is verkocht.', alle: 'Alle joosje doodles' },
    'nieuws-van-klaas': { naam: 'Nieuws van Klaas', kort: 'Nieuws', over: 'Over dit bericht', verkocht: 'Dit bericht is verkocht.', alle: 'Alle nieuws van klaas' },
  },
  de: {
    'india-kasten': { naam: 'Schränke aus Indien', kort: 'Schränke', over: 'Über diesen Schrank', verkocht: 'Dieser Schrank ist verkauft.', alle: 'Alle Schränke aus Indien' },
    'indiase-tafels': { naam: 'Indische Tische', kort: 'Tische', over: 'Über diesen Tisch', verkocht: 'Dieser Tisch ist verkauft.', alle: 'Alle indischen Tische' },
    accessoires: { naam: 'Mehr aus Indien', kort: 'Mehr aus Indien', over: 'Über dieses Stück', verkocht: 'Dieses Stück ist verkauft.', alle: 'Mehr aus Indien' },
    tuinmeubels: { naam: 'Gartenmöbel', kort: 'Gartenmöbel', over: 'Über dieses Gartenmöbel', verkocht: 'Dieses Gartenmöbel ist verkauft.', alle: 'Alle Gartenmöbel' },
    inspiratie: { naam: 'Inspiration', kort: 'Inspiration', over: 'Über dieses Foto', verkocht: 'Dieses Foto ist verkauft.', alle: 'Alle Inspiration' },
    joosjedoodles: { naam: 'Joosje Doodles', kort: 'Joosje Doodles', over: 'Über dieses Werk', verkocht: 'Dieses Werk ist verkauft.', alle: 'Alles von Joosje Doodles' },
    'nieuws-van-klaas': { naam: 'Neues von Klaas', kort: 'Neues', over: 'Über diese Meldung', verkocht: 'Diese Meldung ist verkauft.', alle: 'Alle Neuigkeiten von Klaas' },
  },
  en: {
    'india-kasten': { naam: 'Indian cabinets', kort: 'Cabinets', over: 'About this cabinet', verkocht: 'This cabinet has been sold.', alle: 'All Indian cabinets' },
    'indiase-tafels': { naam: 'Indian tables', kort: 'Tables', over: 'About this table', verkocht: 'This table has been sold.', alle: 'All Indian tables' },
    accessoires: { naam: 'More from India', kort: 'More from India', over: 'About this piece', verkocht: 'This piece has been sold.', alle: 'More from India' },
    tuinmeubels: { naam: 'Garden furniture', kort: 'Garden furniture', over: 'About this piece', verkocht: 'This piece has been sold.', alle: 'All garden furniture' },
    inspiratie: { naam: 'Inspiration', kort: 'Inspiration', over: 'About this photo', verkocht: 'This photo has been sold.', alle: 'All inspiration' },
    joosjedoodles: { naam: 'Joosje Doodles', kort: 'Joosje Doodles', over: 'About this work', verkocht: 'This work has been sold.', alle: 'All of Joosje Doodles' },
    'nieuws-van-klaas': { naam: 'News from Klaas', kort: 'News', over: 'About this post', verkocht: 'This post has been sold.', alle: 'All news from Klaas' },
  },
};

// Soortpagina's (oude tag-URL's). Meervoud per taal; NL staat in soorten.mjs.
export const SOORT_T: Record<string, { de: string; en: string }> = {
  vitrinekast: { de: 'Vitrinenschränke', en: 'Display cabinets' },
  boekenkast: { de: 'Bücherschränke', en: 'Bookcases' },
  keukenkast: { de: 'Küchenschränke', en: 'Kitchen cabinets' },
  apothekerskast: { de: 'Apothekerschränke', en: 'Apothecary cabinets' },
  woonkamerkast: { de: 'Wohnzimmerschränke', en: 'Living room cabinets' },
  gangkast: { de: 'Flurschränke', en: 'Hallway cabinets' },
  badkamerkast: { de: 'Badezimmerschränke', en: 'Bathroom cabinets' },
  kinderkamerkast: { de: 'Kinderzimmerschränke', en: "Children's room cabinets" },
  studeerkamerkast: { de: 'Schränke fürs Arbeitszimmer', en: 'Study cabinets' },
  kantoorkast: { de: 'Büroschränke', en: 'Office cabinets' },
  'oude-winkelkast': { de: 'Alte Ladenschränke', en: 'Old shop cabinets' },
  'vintage-kast': { de: 'Vintage-Schränke', en: 'Vintage cabinets' },
  linnenkast: { de: 'Wäscheschränke', en: 'Linen cupboards' },
  'tv-kast': { de: 'TV-Schränke', en: 'TV cabinets' },
  commode: { de: 'Kommoden', en: 'Chests of drawers' },
};

// ---------- Vaste teksten die op meerdere plekken staan ----------
export const UI = {
  nl: {
    naarInhoud: 'Naar de inhoud',
    nav: { kasten: 'Kasten', meer: 'Meer bij Klaas', over: 'Over Klaas', contact: 'Contact' },
    menu: 'Menu', hoofdmenu: 'Hoofdmenu', taalKiezen: 'Taal',
    usp: ['Rechtstreeks uit India', 'Oude kasten van primair teakhout', 'Wij bezorgen'],
    appKlaas: 'App Klaas', belKlaas: 'Bel Klaas', bel: 'Bel',
    waHoi: 'Hallo Klaas, ik heb een vraag over een kast.',
    home: 'Home', collectie: 'Collectie',
    teKoop: 'Te koop', verkocht: 'Verkocht', prijsOpAanvraag: 'Prijs op aanvraag', alles: 'Alles', toon: 'Toon',
    voet: {
      merk: 'De Kasten van Klaas zijn unieke exemplaren, eigenhandig geïmporteerd uit India.',
      winkel: 'Winkel', open: 'Open', ofAfspraak: 'Of op afspraak', collectie: 'Collectie',
      indiaKasten: 'India kasten', meer: 'Meer bij Kast van Klaas', privacy: 'Privacy', voorwaarden: 'Algemene voorwaarden', door: 'Website door',
    },
    dagen: ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'],
    tot: 'tot', uur: 'uur', vandaag: 'vandaag', openingstijden: 'Openingstijden', ofOpAfspraak: 'Of op afspraak.',
    kruimelpad: 'Kruimelpad', foto: 'foto', fotos: "Foto's", toonFoto: 'Toon foto',
    alleenNl: '', // NL heeft geen vertaalmelding
  },
  de: {
    naarInhoud: 'Zum Inhalt',
    nav: { kasten: 'Schränke', meer: 'Mehr bei Klaas', over: 'Über Klaas', contact: 'Kontakt' },
    menu: 'Menü', hoofdmenu: 'Hauptmenü', taalKiezen: 'Sprache',
    usp: ['Direkt aus Indien', 'Alte Schränke aus Teakholz aus Primärwald', 'Wir liefern'],
    appKlaas: 'WhatsApp an Klaas', belKlaas: 'Klaas anrufen', bel: 'Anrufen:',
    waHoi: 'Hallo Klaas, ich habe eine Frage zu einem Schrank.',
    home: 'Start', collectie: 'Kollektion',
    teKoop: 'Zu verkaufen', verkocht: 'Verkauft', prijsOpAanvraag: 'Preis auf Anfrage', alles: 'Alle', toon: 'Anzeigen',
    voet: {
      merk: 'Die Schränke von Klaas sind Einzelstücke, von ihm selbst aus Indien importiert.',
      winkel: 'Laden', open: 'Geöffnet', ofAfspraak: 'Oder nach Vereinbarung', collectie: 'Kollektion',
      indiaKasten: 'Schränke aus Indien', meer: 'Mehr bei Kast van Klaas', privacy: 'Datenschutz', voorwaarden: 'AGB', door: 'Website von',
    },
    dagen: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
    tot: 'bis', uur: 'Uhr', vandaag: 'heute', openingstijden: 'Öffnungszeiten', ofOpAfspraak: 'Oder nach Vereinbarung.',
    kruimelpad: 'Brotkrumen', foto: 'Foto', fotos: 'Fotos', toonFoto: 'Foto anzeigen',
    alleenNl: 'Diese Beschreibung gibt es bisher nur auf Niederländisch.',
  },
  en: {
    naarInhoud: 'Skip to content',
    nav: { kasten: 'Cabinets', meer: 'More from Klaas', over: 'About Klaas', contact: 'Contact' },
    menu: 'Menu', hoofdmenu: 'Main menu', taalKiezen: 'Language',
    usp: ['Straight from India', 'Old cabinets in old-growth teak', 'We deliver'],
    appKlaas: 'WhatsApp Klaas', belKlaas: 'Call Klaas', bel: 'Call',
    waHoi: 'Hello Klaas, I have a question about a cabinet.',
    home: 'Home', collectie: 'Collection',
    teKoop: 'For sale', verkocht: 'Sold', prijsOpAanvraag: 'Price on request', alles: 'All', toon: 'Show',
    voet: {
      merk: 'The cabinets of Kast van Klaas are one-off pieces, imported from India by Klaas himself.',
      winkel: 'Shop', open: 'Open', ofAfspraak: 'Or by appointment', collectie: 'Collection',
      indiaKasten: 'Indian cabinets', meer: 'More at Kast van Klaas', privacy: 'Privacy', voorwaarden: 'Terms and conditions', door: 'Website by',
    },
    dagen: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    tot: 'to', uur: '', vandaag: 'today', openingstijden: 'Opening hours', ofOpAfspraak: 'Or by appointment.',
    kruimelpad: 'Breadcrumb', foto: 'photo', fotos: 'Photos', toonFoto: 'Show photo',
    alleenNl: 'This description is only available in Dutch for now.',
  },
} as const;

/** Openingstijd als tekst: "12.00 tot 18.00 uur", "12:00 bis 18:00 Uhr", "12:00 to 18:00". */
export const tijdvak = (open: string, dicht: string, taal: Taal, metUur = true) => {
  const u = UI[taal];
  return `${tijdT(open, taal)} ${u.tot} ${tijdT(dicht, taal)}${metUur && u.uur ? ' ' + u.uur : ''}`;
};
