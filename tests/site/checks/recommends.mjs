import assert from 'node:assert/strict';
import { collect, matches } from './helpers.mjs';

// Recommends page and homepage recommendations.
export const check = collect('recommends', async ({ homepage, recommends }) => {
  assert.match(homepage, /<section\b[^>]*class="recent-recommendations"[\s\S]*?<div\b[^>]*class="recent-heading"[^>]*\bdata-motion-beat\b[^>]*>[\s\S]*?<h2[^>]*>Recent recommendations<\/h2>/i, 'Recent recommendations heading must be a publication motion beat');
  assert.match(recommends, /class="recommendations-filter-links"[\s\S]*\?medium=read/i, 'no-JS query filters must exist');
  assert.match(recommends, /data-recommend-filter="all"[^>]*aria-pressed="true"/i, 'enhanced filters must use aria-pressed');
  assert.match(recommends, /role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/i, 'filter count must be announced');
  assert.match(recommends, /class="sr-only"> \(external site\)<\/span>/i, 'external recommendation links must name context');
  assert.doesNotMatch(recommends, /class="rec-tags"/i, 'recommendation topic tags must stay off the page');

  const homepageRecommendations = matches(homepage, /<article\b[^>]*class="[^"]*\brec\b[^"]*"[^>]*\bdata-recommendation\b[^>]*>[\s\S]*?<\/article>/gi)
    .map((match) => match[0]);
  const recommendationCards = matches(recommends, /<article\b[^>]*class="[^"]*\brec\b[^"]*"[^>]*\bdata-recommendation\b[^>]*>[\s\S]*?<\/article>/gi)
    .map((match) => match[0]);

  const publishedRecommendationUrls = matches(recommends, /class="rec-title"[\s\S]*?<a\b[^>]*href="([^"]+)"/gi)
    .map((match) => match[1]);
  const homepageRecommendationUrls = homepageRecommendations
    .map((item) => item.match(/class="rec-title"[\s\S]*?<a\b[^>]*href="([^"]+)"/i)?.[1]);
  assert.equal(
    homepageRecommendations.length,
    Math.min(3, publishedRecommendationUrls.length),
    'homepage recommendations must use the deliberate three-item cap',
  );
  assert.deepEqual(
    homepageRecommendationUrls,
    publishedRecommendationUrls.slice(0, 3),
    'homepage recommendations must match the published newest-first chronology',
  );
  assert.doesNotMatch(homepage, /home-recommendation-row|data-home-recommendation|home-recommendation-title/i, 'homepage must not use legacy recommendation markup');
  if (homepageRecommendations.length > 0) {
    const homepageRecommendationMotionRows = matches(homepage, /<article\b[^>]*class="[^"]*\brec\b[^"]*"[^>]*\bdata-motion-beat\b[^>]*>/gi);
    assert.equal(homepageRecommendationMotionRows.length, homepageRecommendations.length, 'every homepage recommendation must be a publication motion beat');
    assert.match(homepage, /class="all-recommendations-link"[^>]*\bdata-motion-beat\b[^>]*href="\/recommends"[^>]*>\s*All recommendations/i, 'homepage must end recommendations with a motion-enabled All recommendations link');
    assert.match(homepage, /href="\/recommends"[^>]*>\s*All recommendations/i, 'homepage must link to all recommendations');
    for (const item of homepageRecommendations) {
      assert.match(item, /class="rec-visual"/i, 'homepage recommendation must preserve RecommendCard artwork or medium-mark markup');
      assert.match(item, /class="rec-meta"/i, 'homepage recommendation must preserve RecommendCard metadata');
      assert.match(item, /class="rec-title"/i, 'homepage recommendation must preserve RecommendCard titles');
      assert.match(item, /<h3\b[^>]*class="rec-title"[^>]*>/i, 'homepage recommendation titles must follow their section heading at h3');
      assert.match(item, /data-medium="(?:read|watch|listen)"/i, 'homepage recommendation must expose its medium');
      assert.match(item, /<time\b[^>]*datetime="[^"]+"[^>]*>/i, 'homepage recommendation must include a machine-readable date');
      assert.match(item, /class="sr-only"> \(external site\)<\/span>/i, 'homepage external links must name context');
      assert.doesNotMatch(item, /\b(?:rec-tags|priority)\b/i, 'homepage recommendations must not expose tags or priority');
    }
  }
  for (const item of recommendationCards) {
    assert.match(item, /<h2\b[^>]*class="rec-title"[^>]*>/i, 'Recommends index titles must retain their default h2 level');
  }

  // Recommends: introduced exactly as "Things I thought were interesting."
  assert.match(recommends, />\s*Things I thought were interesting\.\s*</, 'Recommends must be introduced exactly as: Things I thought were interesting.');
});
