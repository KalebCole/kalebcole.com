import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
    url: z.string().url(),
    date: z.date(),
    // read | watch | listen
    medium: z.enum(['read', 'watch', 'listen']).default('read'),
    author: z.string().optional(),
    // publication / domain, e.g. "YouTube", "Bun"
    source: z.string().optional(),
    image: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    // Kaleb's optional annotation.
    take: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Where the project actually lives: repo, package, docs, or demo.
    url: z.string().url(),
    status: z.enum(['idea', 'in progress', 'shipped', 'archived']),
    // Lower numbers appear first. Kaleb controls the running order by hand.
    order: z.number().default(100),
    // Site-hosted image path. Optional so a project can publish before its art exists.
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    // What Kaleb did, when the project isn't his alone.
    role: z.string().optional(),
    tech: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }).refine((data) => !data.image || Boolean(data.imageAlt), {
    message: 'imageAlt is required whenever image is set',
    path: ['imageAlt'],
  }),
});

export const collections = { blog, recommends, projects };
