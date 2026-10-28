import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import { PRODUCTION_ORIGIN } from './src/lib/site-origin.mjs';

export default defineConfig({
  site: PRODUCTION_ORIGIN,
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});