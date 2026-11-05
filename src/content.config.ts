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

export const collections = { kasten };
