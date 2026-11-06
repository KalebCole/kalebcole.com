import assert from 'node:assert/strict';
import { attribute, collect, localAsset, matches, metaContent, text } from './helpers.mjs';

// /privacy is the Work Cal Mirror calendar-app policy. It is not a privacy policy for the site.
const POLICY_PARAGRAPHS = [
  "This is the privacy policy for Work Cal Mirror, a calendar app for Kaleb Cole's personal use only. It is not a privacy policy for kalebcole.com.",
  "Work Cal Mirror reads Kaleb Cole's work calendar feed. It copies event titles, times, and free/busy into a Google calendar the app created in his own account.",
  'That data goes only to Google and is never sold or shared with anyone else.',
  'To ask about Work Cal Mirror, email kalebcole2021@gmail.com.',
];

function visibleText(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export const check = collect('privacy', async ({ routes }) => {
  const route = '/privacy/';
  assert.ok(routes.has(route), 'production build must emit /privacy/');
  const html = text(routes.get(route));
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
  assert.equal(
    visibleText(main),
    `Work Cal Mirror privacy policy ${POLICY_PARAGRAPHS.join(' ')}`,
    '/privacy/ must use the approved Work Cal Mirror policy text',
  );
  assert.match(html, /<title>Work Cal Mirror privacy policy \| Kaleb Cole<\/title>/, '/privacy/ document title must name the app');
  assert.equal(
    metaContent(html, 'name', 'description'),
    "Privacy policy for Work Cal Mirror, a calendar app for Kaleb Cole's personal use.",
    '/privacy/ description must name the app and stay off the rest of the site',
  );
  assert.match(html, /<link\b[^>]*rel="canonical"[^>]*href="https:\/\/kalebcole\.com\/privacy\/?"/i, '/privacy/ canonical must be the public policy URL');

  const links = matches(main, /<a\b[^>]*>/gi).map((match) => match[0]);
  assert.deepEqual(links.map((link) => attribute(link, 'href')), ['mailto:kalebcole2021@gmail.com'], '/privacy/ must link only the contact email');

  const navigation = html.match(/<nav\b[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? '';
  assert.doesNotMatch(navigation, /href="\/privacy\/?"/i, '/privacy/ must stay out of primary navigation');
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/i)?.[0] ?? '';
  assert.doesNotMatch(footer, /href="\/privacy\/?"/i, '/privacy/ must stay out of the shared footer');
  assert.doesNotMatch(text(localAsset('/llms.txt')), /Work Cal Mirror/, '/llms.txt must not turn the app policy into a site-wide claim');
  assert.doesNotMatch(
    visibleText(main),
    /sqlite|retention|delet|encrypt|security|gdpr|ccpa|compliance|verif|cookie|local storage|locally|\bstored\b|oauth|calendar\.app\.created/i,
    '/privacy/ must not add unapproved storage, retention, security, verification, or compliance claims',
  );
});
