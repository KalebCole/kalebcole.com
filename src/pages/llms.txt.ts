import { getCollection } from 'astro:content';
import { getPinnedRepos } from '../lib/github.mjs';
import { buildLlmsTxt } from '../lib/llms-txt.mjs';

export async function GET() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const { repos } = getPinnedRepos();
  return new Response(buildLlmsTxt({ posts, repos }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
