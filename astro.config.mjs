import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import rehypeCallouts from 'rehype-callouts';
import readableTables from './src/lib/rehype-readable-tables.mjs';
import { PRODUCTION_ORIGIN } from './src/lib/site-origin.mjs';

export default defineConfig({
  site: PRODUCTION_ORIGIN,
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap()],
  markdown: {
    rehypePlugins: [[rehypeCallouts, { showIndicator: false }], readableTables],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});