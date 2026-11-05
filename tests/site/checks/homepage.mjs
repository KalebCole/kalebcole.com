import assert from 'node:assert/strict';
import { join } from 'node:path';
import { attribute, collect, matches, root, text } from './helpers.mjs';

// Homepage hero, profile bubbles, responsive layout CSS, portrait sources, and heading levels.
export const check = collect('homepage', async ({ homepage, globalCss }) => {
  const polaroidSource = text(join(root, 'src', 'components', 'Polaroid.astro'));
  const homepageSource = text(join(root, 'src', 'pages', 'index.astro'));

  const pinnedWritingSource = text(join(root, 'src', 'components', 'PinnedWriting.astro'));
  const recommendCardSource = text(join(root, 'src', 'components', 'RecommendCard.astro'));

  assert.doesNotMatch(homepage, /This is where I write through the ideas that get stuck in my head\./i, 'retired hero copy must stay removed');
  assert.match(homepage, /href="\/projects"[^>]*>\s*See my projects\s*<\/a>/i, 'homepage hero must link to Projects');
  assert.match(homepage, /href="\/blog"[^>]*>\s*Read my writing\s*<\/a>/i, 'homepage hero must link to Writing');
  const homepageHero = homepage.match(/<section\b[^>]*class="home-hero"[^>]*>[\s\S]*?<\/section>/i)?.[0] ?? '';
  assert.doesNotMatch(homepageHero, /\bdata-motion-beat\b/i, 'homepage hero and its children must not receive publication motion hooks');
  const homeActions = homepageHero.match(/<div\b[^>]*class="home-actions"[^>]*>[\s\S]*?<\/div>\s*<\/section>/i)?.[0] ?? '';
  assert.match(homeActions, /^<div\b[^>]*\brole="group"[^>]*\baria-label="Explore my work"/i, 'the hero action group must expose its label as a named group');
  const homeElsewhere = homeActions.match(/<div\b[^>]*class="home-elsewhere"[^>]*>[\s\S]*?<\/div>/i)?.[0] ?? '';
  assert.ok(homeElsewhere, 'homepage hero must render the stamped profile bubbles');
  assert.match(homeActions, /<div\b[^>]*class="home-primary-actions"[^>]*>[\s\S]*?<div\b[^>]*class="home-elsewhere"/i, 'profile bubbles must follow the primary CTA pair in the same subordinate action group');
  assert.match(homeActions, /\bdata-home-layout-hero\b/i, 'the action group must remain an explicit hero layout-motion target');
  assert.doesNotMatch(homeElsewhere, /\bdata-home-layout-hero\b/i, 'bubbles must move with their action group, not become an incidental standalone motion target');
  assert.doesNotMatch(homeElsewhere, /<section\b|<nav\b|home-elsewhere-label|>\s*Elsewhere\s*</i, 'bubbles must not add a label or navigation landmark');
  assert.match(homepage, /<footer\b[\s\S]*?<nav\b[^>]*aria-label="Footer profile links"[^>]*>/i, 'footer profile links must retain their visible behavior and named landmark');
  const elsewhereLinks = matches(homeElsewhere, /<a\b[^>]*>[\s\S]*?<\/a>/gi).map((match) => match[0]);
  assert.equal(elsewhereLinks.length, 4, 'profile bubbles must render exactly four links');
  const expectedElsewhereLinks = [
    ['LinkedIn', 'https://www.linkedin.com/in/kaleb-cole', 'Kaleb Cole on LinkedIn, external link'],
    ['GitHub', 'https://github.com/KalebCole', 'Kaleb Cole on GitHub, external link'],
    ['X', 'https://x.com/Kalebicole', 'Kaleb Cole on X, external link'],
    ['Email', 'mailto:kalebcole2021@gmail.com', 'Email Kaleb Cole, opens email client'],
  ];
  for (const [index, [label, href, accessibleName]] of expectedElsewhereLinks.entries()) {
    const link = elsewhereLinks[index];
    assert.equal(attribute(link, 'href'), href, `${label} bubble destination`);
    assert.equal(attribute(link, 'aria-label'), accessibleName, `${label} bubble accessible name`);
    assert.doesNotMatch(link, /\btarget=/i, `${label} bubble must remain same-tab`);
    assert.match(link, /class="home-elsewhere-bubble"/i, `${label} must use the stamped bubble treatment`);
    assert.match(link, /<svg\b[^>]*aria-hidden="true"/i, `${label} bubble must expose an inline decorative logo`);
  }
  assert.match(globalCss, /\.home-elsewhere-bubble\s*\{[\s\S]*?width: 48px;[\s\S]*?height: 48px;[\s\S]*?flex: 0 0 48px;/, 'profile bubbles must retain 44px-plus reduced-scale native targets');
  assert.match(globalCss, /\.home-elsewhere-bubble\s*\{[\s\S]*?border-radius: 50%;[\s\S]*?box-shadow: 3px 4px 0 var\(--coral\);/, 'profile bubbles must remain individual reduced physical stamped circles');
  assert.match(globalCss, /\.home-elsewhere-bubble::after\s*\{[\s\S]*?inset: 5px;[\s\S]*?var\(--ink\) 8%, var\(--ground\)/, 'profile bubbles must retain the approved restrained inner ring');
  assert.match(
    globalCss,
    /\.home-actions\s*\{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?@media \(min-width: 1200px\) \{[\s\S]*?\.home-actions\s*\{[\s\S]*?flex-direction: row;[\s\S]*?gap: 1\.5rem;[\s\S]*?\.home-elsewhere\s*\{[\s\S]*?flex: 0 0 auto;/,
    'profile bubbles must remain below the CTAs through 1199px and inline from 1200px',
  );
  assert.doesNotMatch(globalCss, /\.home-elsewhere\s*\{[\s\S]*?flex: 0 0 100%/, 'profile bubbles must not retain the former always-below full-width rule');
  assert.match(globalCss, /@media \(forced-colors: active\)[\s\S]*?\.home-elsewhere-bubble\s*\{[\s\S]*?border-color: ButtonText;/, 'profile bubbles must remain visible in forced colors');
  assert.match(globalCss, /@media \(forced-colors: active\)[\s\S]*?\.home-elsewhere-bubble svg\s*\{[\s\S]*?color: ButtonText;/, 'profile SVG marks must remain visible in forced colors');
  assert.match(globalCss, /@media \(forced-colors: active\)[\s\S]*?\.home-elsewhere-bubble:hover svg,[\s\S]*?\.home-elsewhere-bubble:active svg\s*\{[\s\S]*?color: HighlightText;/, 'profile SVG marks must remain visible against forced-colors highlights');
  assert.match(globalCss, /\.home-elsewhere-bubble svg\s*\{[\s\S]*?color: var\(--mount-ink\);[\s\S]*?fill: currentColor;/, 'profile SVG marks must use dark mount ink rather than page ink');
  assert.match(globalCss, /\.home-elsewhere-bubble \.home-elsewhere-mail\s*\{[\s\S]*?fill: none;[\s\S]*?stroke: currentColor;/, 'email SVG mark must inherit mount ink');
  const socialMarkRule = globalCss.match(/\.home-elsewhere-bubble svg\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(socialMarkRule, /(?:white|#fff|#ffffff)/i, 'profile SVG marks must not hardcode white against the pale mount');
  assert.match(globalCss, /\.home-elsewhere-bubble:hover\s*\{[\s\S]*?background: var\(--soft-blue\);[\s\S]*?color: var\(--blue\);[\s\S]*?transform: translate\(-1px, -2px\);/, 'profile bubble hover must retain its intentional physical lift in both themes');
  assert.match(globalCss, /\.home-elsewhere-bubble:hover svg\s*\{[\s\S]*?color: var\(--blue\);/, 'profile SVG marks must use blue against the soft-blue hover mount');
  assert.doesNotMatch(homeElsewhere, /\bdata-motion-beat\b/i, 'bubbles must not become Publication Story Beats');

  assert.match(
    globalCss,
    /grid-template-areas:\s*"greeting"\s*"portrait"\s*"statement"\s*"subtitle"\s*"actions";/,
    'homepage mobile layout must place the portrait between the greeting and statement',
  );
  const homepageGreetingIndex = homepage.indexOf('class="home-greeting"');
  const homepagePortraitIndex = homepage.indexOf('class="portrait-mount"');
  const homepageStatementIndex = homepage.indexOf('class="home-statement"');
  assert.ok(
    homepageGreetingIndex < homepagePortraitIndex && homepagePortraitIndex < homepageStatementIndex,
    'homepage source order must place the portrait between the greeting and statement',
  );
  assert.match(
    globalCss,
    /@media \(max-width: 849px\) \{[\s\S]*?\.home-hero \{[\s\S]*?justify-items: center;[\s\S]*?row-gap: 30px;[\s\S]*?padding-block: 44px 68px;[\s\S]*?text-align: center;[\s\S]*?\.portrait-mount \{[\s\S]*?width: min\(292px, calc\(100% - 12px\)\);/,
    'homepage mobile hero must use the approved centered 292px portrait and 30px rhythm',
  );
  assert.match(
    globalCss,
    /@media \(min-width: 850px\) \{[\s\S]*?\.home-hero \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/,
    'homepage desktop composition must wait for a stable text column',
  );
  const desktopHeroCss = globalCss.match(/@media \(min-width: 850px\) \{([\s\S]*?)\n\}\n\n@media \(min-width: 850px\) and \(max-height: 850px\)/)?.[1] ?? '';
  assert.match(
    desktopHeroCss,
    /grid-template-areas:\s*"greeting portrait"\s*"statement portrait"\s*"subtitle portrait"\s*"actions portrait";/,
    'desktop hero must end its grid at the combined CTA and profile-bubble action row',
  );
  assert.doesNotMatch(desktopHeroCss, /"elsewhere portrait"/, 'desktop hero must not retain an empty profile-bubble grid row');
  assert.match(
    polaroidSource,
    /srcset="\/me-300\.webp 300w, \/me-600\.webp 600w, \/me-1200\.webp 1200w, \/me-1600\.webp 1600w"/,
    'homepage portrait must expose high-density WebP candidates through 1600px',
  );
  assert.match(
    polaroidSource,
    /sizes="\(max-width: 343px\) calc\(100vw - 52px\), \(max-width: 849px\) 292px, \(min-width: 1100px\) 340px, 300px"/,
    'homepage portrait sizes hint must match approved mobile and desktop widths',
  );

  assert.match(pinnedWritingSource, /headingLevel\?: 2 \| 3/, 'PinnedWriting must expose an explicit heading-level prop');
  assert.match(recommendCardSource, /headingLevel\?: 2 \| 3/, 'RecommendCard must expose an explicit heading-level prop');
  assert.match(homepageSource, /<PinnedWriting\b[^>]*\bheadingLevel=\{3\}/, 'homepage pinned writing must request h3 titles');
  assert.match(homepageSource, /<RecommendCard\b[^>]*\bheadingLevel=\{3\}/, 'homepage recommendations must request h3 titles');
});
