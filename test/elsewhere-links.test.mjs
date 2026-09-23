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
  const globalCss = source('src/styles/global.css');

  assert.match(homepage, /import \{ ELSEWHERE_LINKS \} from '\.\.\/lib\/elsewhere\.mjs';/);
  assert.match(homepage, /<div\b[^>]*class="home-actions"[^>]*>[\s\S]*?<div\b[^>]*class="home-primary-actions"[^>]*>[\s\S]*?<div\b[^>]*class="home-elsewhere"[^>]*>[\s\S]*?ELSEWHERE_LINKS\.map/);
  assert.doesNotMatch(homepage, /<section\b[^>]*class="home-elsewhere"/);
  assert.doesNotMatch(homepage, /home-elsewhere-label|aria-label="Profile links"/);
  assert.match(homepage, /class="home-elsewhere-bubble"[\s\S]*?<svg\b[\s\S]*?aria-hidden="true"/);
  assert.match(footer, /import \{ ELSEWHERE_LINKS \} from '\.\.\/lib\/elsewhere\.mjs';/);
  assert.match(footer, /\[\.\.\.ELSEWHERE_LINKS\]\.sort/);
  assert.match(footer, /<nav\b[^>]*aria-label="Footer profile links"/);
  assert.match(
    globalCss,
    /\.home-actions\s*\{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?@media \(min-width: 1024px\) \{[\s\S]*?\.home-actions\s*\{[\s\S]*?flex-direction: row;[\s\S]*?gap: 1\.5rem;[\s\S]*?\.home-elsewhere\s*\{[\s\S]*?flex: 0 0 auto;/,
    'the combined action cluster must keep bubbles below the CTAs through 1023px and inline from 1024px',
  );
  assert.doesNotMatch(globalCss, /\.home-elsewhere\s*\{[\s\S]*?flex: 0 0 100%/, 'bubbles must not retain the former always-below full-width rule');

  assert.match(
    globalCss,
    /\.home-elsewhere-bubble\s*\{[\s\S]*?width: 48px;[\s\S]*?height: 48px;[\s\S]*?flex: 0 0 48px;[\s\S]*?background: var\(--mount\);[\s\S]*?border: 2px solid var\(--ink\);[\s\S]*?border-radius: 50%;[\s\S]*?box-shadow: 3px 4px 0 var\(--coral\);/,
    'hero bubbles must use the approved reduced 48px stamped-circle treatment',
  );
  assert.match(
    globalCss,
    /\.home-elsewhere-bubble::after\s*\{[\s\S]*?inset: 5px;[\s\S]*?border: 1px solid color-mix\(in oklch, var\(--ink\) 8%, var\(--ground\)\);/,
    'hero bubbles must retain the restrained inner ring from the approved prototype',
  );
  assert.match(
    globalCss,
    /\.home-elsewhere-bubble svg\s*\{[\s\S]*?width: 19px;[\s\S]*?height: 19px;[\s\S]*?color: var\(--mount-ink\);[\s\S]*?fill: currentColor;/,
    'hero bubble marks must remain proportionate and use readable mount ink',
  );
  assert.match(
    globalCss,
    /\.home-elsewhere-bubble \.home-elsewhere-mail\s*\{[\s\S]*?fill: none;[\s\S]*?stroke: currentColor;/,
    'email mark must inherit the same mount-ink color as the filled marks',
  );
  assert.doesNotMatch(
    globalCss.match(/\.home-elsewhere-bubble svg\s*\{[\s\S]*?\n\}/)?.[0] ?? '',
    /(?:white|#fff|#ffffff)/i,
    'hero bubble marks must not hardcode white against the pale mount',
  );
});
