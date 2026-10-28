import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { recommendUrl } from './lib/recommend-url.mjs';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    description: z.string(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    updated: z.date().optional(),
  }),
});

const recommends = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recommends' }),
  schema: z.object({
    title: z.string(),
    // Must already be clean: see src/lib/recommend-url.mjs and scripts/clean-url.mjs.
    url: recommendUrl,
    date: z.date(),
    // read | watch | listen
    medium: z.enum(['read', 'watch', 'listen']).default('read'),
    author: z.string().optional(),
    // publication / domain, e.g. "YouTube", "Bun"
    source: z.string().optional(),
    image: recommendUrl.optional(),
    tags: z.array(z.string()).default([]),
    // Kaleb's optional annotation.
    take: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, recommends };
