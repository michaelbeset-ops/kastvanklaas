import type { APIRoute } from 'astro';
import { SITE, zaak, tijden } from '../lib/site';

// Korte, feitelijke samenvatting voor AI-agents. Alleen gegevens die ook op de site staan.
export const GET: APIRoute = () => new Response([
  `# ${zaak.naam}`,
  '',
  `> Winkel op de ${zaak.straat}, ${zaak.postcode} ${zaak.plaats} met oude kasten en meubels uit India, 60 tot 100 jaar oud en van primair teakhout. Eigenaar ${zaak.eigenaar} zoekt ze zelf uit in India. Elke kast is uniek en heeft een eigen kastnummer (bijvoorbeeld 20B5).`,
  '',
  `- Telefoon en WhatsApp: ${zaak.telefoon}`,
  `- E-mail: ${zaak.email}`,
  `- Openingstijden: ${tijden.map((t) => `${t.dag} ${t.open}-${t.dicht}`).join(', ')}`,
  `- KvK: ${zaak.kvk}`,
  '- Kopen: reserveren via de site, WhatsApp of in de winkel. Bezorgen in Nederland is mogelijk.',
  '',
  '## Pagina\'s',
  `- [Collectie](${SITE}/webshop/): alle kasten, te koop en verkocht, zoeken op kastnummer`,
  `- [India kasten](${SITE}/webshop/cat/india-kasten/)`,
  `- [Vitrinekasten uit India](${SITE}/vitrinekast-uit-india/)`,
  `- [Indiase tafels](${SITE}/webshop/cat/indiase-tafels/)`,
  `- [Over Klaas](${SITE}/over-kast-van-klaas/)`,
  `- [Contact en route](${SITE}/contact/)`,
  '',
  '## Taalversies',
  'De hele site, inclusief elke kastpagina, bestaat in drie talen met dezelfde paden: Nederlands op de root, Duits onder /de/ en Engels onder /en/.',
  `- [Nederlands](${SITE}/)`,
  `- [Deutsch](${SITE}/de/): Schränke aus Indien, [Kollektion](${SITE}/de/webshop/), [Kontakt](${SITE}/de/contact/)`,
  `- [English](${SITE}/en/): Indian cabinets, [collection](${SITE}/en/webshop/), [contact](${SITE}/en/contact/)`,
  '',
].join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
