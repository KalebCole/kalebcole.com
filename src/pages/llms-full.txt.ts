import { getCollection } from 'astro:content';
import { getPinnedRepos } from '../lib/github.mjs';
import { getPublishedRecommends } from '../lib/recommends';
import { buildLlmsFullTxt } from '../lib/llms-txt.mjs';

export async function GET() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const recommends = await getPublishedRecommends();
  const { repos } = getPinnedRepos();
  return new Response(buildLlmsFullTxt({ posts, repos, recommends }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
