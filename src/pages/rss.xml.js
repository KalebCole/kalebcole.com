import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { PRODUCTION_ORIGIN } from '../lib/site-origin.mjs';

export async function GET(context) {
  const posts = (await getCollection('blog'))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: 'Kaleb Cole',
    description: 'Writing by Kaleb Cole.',
    site: context.site ?? PRODUCTION_ORIGIN,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}`,
    })),
  });
}