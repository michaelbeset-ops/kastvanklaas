import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Elke kast is een los JSON-bestand: dat kan Klaas straks via /beheer/ (Sveltia CMS) zelf aanmaken en wijzigen.
const kasten = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/kasten' }),
  schema: ({ image }) =>
    z.object({
      id: z.number().optional(),
      code: z.string().nullable().default(null), // kastnummer, bv. 20B5
      naam: z.string(),
      slug: z.string(),
      categorie: z.string(), // bepaalt het pad: /webshop/<categorie>/<slug>/
      categorieen: z.array(z.string()).default([]),
      status: z.enum(['te-koop', 'verkocht']),
      prijs: z.number().nullable().default(null),
      maten: z.string().nullable().default(null),
      omschrijving: z.string().default(''),
      fotos: z.array(z.object({ src: image(), alt: z.string() })).min(1),
      tags: z.array(z.string()).default([]),
      inCollectie: z.boolean().default(true),
      volgorde: z.number().default(0),
      toegevoegd: z.coerce.string().optional(), // gezet door het CMS bij nieuwe kasten
    }),
});

// Duitse en Engelse teksten per kast, los van de kast zelf: Klaas en het CMS zien deze map niet, dus zijn
// Nederlandse werkwijze verandert niet. Bestandsnaam = slug van de kast. "bron" is een vingerafdruk van de
// Nederlandse naam en tekst op het moment van vertalen; wijkt die af, dan meldt `npm run vertalingen-ontbreken` het.
const taalTekst = z.object({
  naam: z.string().default(''),
  omschrijving: z.string().default(''),
  alt: z.record(z.string(), z.string()).default({}), // Nederlandse alt-tekst -> vertaling
});
const vertalingen = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/vertalingen' }),
  schema: z.object({
    slug: z.string(),
    bron: z.string(),
    de: taalTekst.optional(),
    en: taalTekst.optional(),
  }),
});

export const collections = { kasten, vertalingen };
