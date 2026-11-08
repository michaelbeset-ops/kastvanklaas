// Afbeeldingen-sitemap: per productpagina alle foto's, zodat de kasten ook in Google Afbeeldingen komen.
// Ook de Duitse en Engelse kastpagina's (alleen als ze vertaald zijn), met de vertaalde omschrijving van de foto.
import { getImage } from 'astro:assets';
import { alleKasten, padVan, label } from '../lib/kasten';
import { SITE } from '../lib/site';
import { TALEN } from '../lib/i18n';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET() {
  const urls: string[] = [];
  for (const taal of TALEN) {
    const kasten = (await alleKasten(taal)).filter((k) => k.naam && k.categorie !== 'inspiratie' && k.toon.vertaald);
    urls.push(...await Promise.all(kasten.map(async (k) => {
      const beelden = await Promise.all(k.toon.fotos.map(async (f) => {
        const img = await getImage({ src: f.src, width: 1200, format: 'jpg', quality: 68 });
        return `<image:image><image:loc>${esc(new URL(img.src, SITE).href)}</image:loc><image:title>${esc(f.alt || label(k))}</image:title></image:image>`;
      }));
      return `<url><loc>${esc(new URL(padVan(k, taal), SITE).href)}</loc>${beelden.join('')}</url>`;
    })));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
