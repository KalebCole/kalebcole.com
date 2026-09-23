import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ELSEWHERE_LINKS } from '../src/lib/elsewhere.mjs';

const root = new URL('..', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');

test('Elsewhere source defines the approved hero destinations and accessible names', () => {
  assert.deepEqual(
    ELSEWHERE_LINKS.map(({ id, label, href, accessibleName }) => ({ id, label, href, accessibleName })),
    [
      {
        id: 'linkedin',
        label: 'LinkedIn',
        href: 'https://www.linkedin.com/in/kaleb-cole',
        accessibleName: 'Kaleb Cole on LinkedIn, external link',
      },
      {
        id: 'github',
        label: 'GitHub',
        href: 'https://github.com/KalebCole',
        accessibleName: 'Kaleb Cole on GitHub, external link',
      },
      {
        id: 'email',
        label: 'Email',
        href: 'mailto:kalebcole2021@gmail.com',
        accessibleName: 'Email Kaleb Cole, opens email client',
      },
    ],
  );
});

test('homepage and footer consume the shared Elsewhere source', () => {
  const homepage = source('src/pages/index.astro');
  const footer = source('src/components/SiteFooter.astro');

  assert.match(homepage, /import \{ ELSEWHERE_LINKS \} from '\.\.\/lib\/elsewhere\.mjs';/);
  assert.match(homepage, /<div\b[^>]*class="home-elsewhere"[^>]*>[\s\S]*?<nav\b[^>]*aria-label="Profile links"[^>]*>[\s\S]*?ELSEWHERE_LINKS\.map/);
  assert.doesNotMatch(homepage, /<section\b[^>]*class="home-elsewhere"/);
  assert.match(footer, /import \{ ELSEWHERE_LINKS \} from '\.\.\/lib\/elsewhere\.mjs';/);
  assert.match(footer, /\[\.\.\.ELSEWHERE_LINKS\]\.sort/);
  assert.match(footer, /<nav\b[^>]*aria-label="Footer profile links"/);
});
