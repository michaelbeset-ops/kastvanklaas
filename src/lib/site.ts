// Alle bedrijfsgegevens op een plek. Bron: kastvanklaas.nl (home, contact, over) en de brief van 02-11-2026.
export const SITE = 'https://www.kastvanklaas.nl';

export const zaak = {
  naam: 'Kast van Klaas',
  eigenaar: 'Klaas Hoekstra',
  straat: 'Kaasmarkt 3',
  postcode: '2312 HZ',
  plaats: 'Leiden',
  telefoon: '06-26378480',
  telefoonLink: 'tel:+31626378480',
  whatsapp: '31626378480',
  email: 'klaas@kastvanklaas.nl',
  kvk: '28093664',
  geo: { lat: 52.1596612, lng: 4.4961235 }, // Google-profiel "Kastvanklaas"
  // Google-profiel 'Kastvanklaas' (bron/google/place.json, 17-10-2026): 4,6 uit 13 reviews.
  google: { score: '4,6', aantal: 13, link: 'https://www.google.com/maps/place/Kastvanklaas/@52.1596612,4.4961235,17z/data=!4m6!3m5!1s0x47c5c69210eaa057:0x7be1ee03b9183798!8m2!3d52.1596612!4d4.4961235!16s%2Fg%2F1hc1tl_9r' },
  parkeren: 'Eenvoudig parkeren op de Kaasmarkt, recht voor de deur van de winkel.',
};

// Openingstijden zoals op de eigen site (contactpagina). Let op: Google toont andere tijden, zie eindverslag.
export const tijden = [
  { dag: 'Maandag', kort: 'Mo', open: '12:00', dicht: '18:00' },
  { dag: 'Dinsdag', kort: 'Tu', open: '12:00', dicht: '18:00' },
  { dag: 'Woensdag', kort: 'We', open: '12:00', dicht: '18:00' },
  { dag: 'Donderdag', kort: 'Th', open: '12:00', dicht: '18:00' },
  { dag: 'Vrijdag', kort: 'Fr', open: '12:00', dicht: '18:00' },
  { dag: 'Zaterdag', kort: 'Sa', open: '11:00', dicht: '17:30' },
  { dag: 'Zondag', kort: 'Su', open: '14:00', dicht: '16:00' },
];

// Wordt bij livegang ingevuld. Zolang hier AANLEVEREN staat, valt het formulier terug op mailto en draait er geen teller.
export const WEB3FORMS_KEY = '[[AANLEVEREN: Web3Forms-key]]';
export const GOATCOUNTER_CODE = '[[AANLEVEREN: GoatCounter-code]]';
export const heeftWaarde = (v: string) => !v.includes('AANLEVEREN');

export const CATEGORIE: Record<string, { naam: string; kort: string; enkelvoud: string }> = {
  'india-kasten': { naam: 'India kasten', kort: 'Kasten', enkelvoud: 'kast' },
  'indiase-tafels': { naam: 'Indiase tafels', kort: 'Tafels', enkelvoud: 'tafel' },
  accessoires: { naam: 'Meer uit India', kort: 'Meer uit India', enkelvoud: 'stuk' },
  tuinmeubels: { naam: 'Tuinmeubels', kort: 'Tuinmeubels', enkelvoud: 'tuinmeubel' },
  inspiratie: { naam: 'Inspiratie', kort: 'Inspiratie', enkelvoud: 'foto' },
  joosjedoodles: { naam: 'Joosje Doodles', kort: 'Joosje Doodles', enkelvoud: 'werk' },
  'nieuws-van-klaas': { naam: 'Nieuws van Klaas', kort: 'Nieuws', enkelvoud: 'bericht' },
};
// Volgorde van de soort-filter in de collectie.
export const HOOFDCATEGORIEEN = ['india-kasten', 'indiase-tafels', 'accessoires', 'tuinmeubels'];

export const euro = (n: number) =>
  '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

export const waLink = (tekst: string) => `https://wa.me/${zaak.whatsapp}?text=${encodeURIComponent(tekst)}`;

// Letterlijk van Google (bron/google/reviews-alle.json), alle vijf sterren. Naam: voornaam + initiaal.
export const reviews = [
  { naam: 'Joost P.', tekst: 'Voor onze nieuwe keuken hebben wij bij Kast van Klaas een heel mooie servieskast, ook met glas in de zijwanden, gevonden. Mooi 60 jaar oud, Indiaas meubelmakersvakwerk.' },
  { naam: 'Guus d. B.', tekst: 'Wat een groten keuze aan mooie vitrine kasten. In Verschillende maten.' },
  { naam: 'Natascha W.', tekst: 'Mooie meubels. Zeker een bezoek waard!' },
  { naam: 'Vipan V.', tekst: 'Top service en kwaliteit. Echt authentiek kasten van tiekhout uit india' },
  { naam: 'Caro V. L.', tekst: 'leuke winkel' },
];
// Dezelfde reviews vertaald (zo getrouw mogelijk, niets toegevoegd); op de pagina staat dat ze uit het Nederlands vertaald zijn.
export const reviewsVertaald = {
  de: [
    'Für unsere neue Küche haben wir bei Kast van Klaas einen sehr schönen Geschirrschrank gefunden, auch mit Glas in den Seitenwänden. Schöne 60 Jahre alt, indische Tischlerarbeit.',
    'Was für eine große Auswahl an schönen Vitrinenschränken. In verschiedenen Größen.',
    'Schöne Möbel. Auf jeden Fall einen Besuch wert!',
    'Top Service und Qualität. Wirklich authentische Schränke aus Teakholz aus Indien',
    'schöner Laden',
  ],
  en: [
    'For our new kitchen we found a really beautiful china cabinet at Kast van Klaas, with glass in the side panels too. A good 60 years old, Indian cabinetmaking craftsmanship.',
    'What a large choice of beautiful display cabinets. In different sizes.',
    'Beautiful furniture. Definitely worth a visit!',
    'Top service and quality. Truly authentic teak cabinets from India',
    'nice shop',
  ],
};
