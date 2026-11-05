import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { attribute, collect, localAsset, matches, outputForPath, text } from './helpers.mjs';

// Per-route structure and accessibility: one h1, landmarks, skip link, footer profiles, accessible names, image and video requirements, and no missing local references, same-tab links, video controls and download fallback, heading levels, and the footer Email link.
export const check = collect('page-structure', async ({ routes }) => {
  for (const [route, path] of routes) {
    const html = text(path);
    const h1s = matches(html, /<h1\b/gi);
    const mains = matches(html, /<main\b[^>]*\bid="main-content"/gi);
    assert.equal(h1s.length, 1, `${route} must have one h1`);
    assert.equal(mains.length, 1, `${route} must have one named main landmark`);
    assert.match(html, /<html\b[^>]*\blang="en"/i, `${route} must declare language`);
    assert.match(html, /<a\b[^>]*class="skip-link"[^>]*href="#main-content"/i, `${route} must have a skip link`);
    assert.match(html, /<nav\b[^>]*aria-label="Primary navigation"/i, `${route} must name primary navigation`);
    assert.match(html, /<footer\b/i, `${route} must include the shared footer`);
    assert.doesNotMatch(html, /\btabindex="[1-9]\d*"/i, `${route} must not use positive tabindex`);
    const footerProfiles = new Set(['https://github.com/KalebCole', 'https://www.linkedin.com/in/kaleb-cole', 'https://x.com/Kalebicole']);
    const footerProfilesSeen = new Set();
    for (const match of matches(html, /<footer\b[\s\S]*?<\/footer>/gi)) {
      for (const link of matches(match[0], /<a\b[^>]*>/gi).map((anchor) => anchor[0])) {
        const href = attribute(link, 'href');
        if (/^https:\/\/(?:github\.com|www\.linkedin\.com|x\.com)\//.test(href ?? '')) {
          assert.equal(attribute(link, 'rel'), 'me', `${route} footer profile link ${href} must use rel="me"`);
          footerProfilesSeen.add(href);
        }
      }
    }
    assert.deepEqual([...footerProfilesSeen].sort(), [...footerProfiles].sort(), `${route} footer must link GitHub, LinkedIn, and X`);

    for (const match of matches(html, /<(div|span|p)\b[^>]*\baria-label(?:ledby)?=[^>]*>/gi)) {
      // A generic element cannot carry an accessible name, so screen readers ignore the label (ARIA 1.2 naming prohibited).
      const role = attribute(match[0], 'role');
      assert.ok(role && !['generic', 'presentation', 'none'].includes(role), `${route} <${match[1]}> with an aria-label needs a role that allows naming: ${match[0]}`);
    }
    for (const match of matches(html, /<img\b[^>]*>/gi)) {
      const tag = match[0];
      assert.ok(attribute(tag, 'alt') !== undefined, `${route} image must have alt text`);
      assert.ok(attribute(tag, 'width') && attribute(tag, 'height'), `${route} image must declare dimensions`);
    }
    // WCAG 1.2.1: every video has a visible text description next to it, in the same figure.
    for (const figure of matches(html, /<figure\b[^>]*>[\s\S]*?<\/figure>/gi).map((match) => match[0]).filter((block) => /<video\b/i.test(block))) {
      for (const video of matches(figure, /<video\b[^>]*>/gi).map((match) => match[0])) {
        const describedBy = attribute(video, 'aria-describedby');
        assert.ok(describedBy, `${route} video must reference its description with aria-describedby`);
        const description = figure.match(new RegExp(`<(figcaption|p)\\b[^>]*\\bid="${describedBy}"[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'));
        assert.ok(description, `${route} video description #${describedBy} must be a figcaption or paragraph in the same figure`);
        assert.doesNotMatch(description[0], /\b(?:hidden|sr-only)\b/i, `${route} video description #${describedBy} must be visible`);
        assert.ok(description[2].replace(/<[^>]+>/g, '').trim().length >= 80, `${route} video description #${describedBy} must describe what the video shows`);
      }
    }
    assert.equal(
      matches(html, /<video\b/gi).length,
      matches(html, /<figure\b[^>]*>[\s\S]*?<\/figure>/gi).reduce((count, match) => count + matches(match[0], /<video\b/gi).length, 0),
      `${route} every video must sit in a figure with its description`,
    );
    for (const match of matches(html, /<video\b[^>]*>/gi)) {
      const tag = match[0];
      assert.ok(
        (attribute(tag, 'width') && attribute(tag, 'height')) || attribute(tag, 'style')?.includes('aspect-ratio'),
        `${route} video must reserve intrinsic space`,
      );
    }

    for (const match of matches(html, /\b(?:href|src)="([^"]+)"/gi)) {
      const url = match[1];
      if (!url.startsWith('/') || url.startsWith('//')) continue;
      const pathname = url.split(/[?#]/)[0];
      if (!pathname || pathname === '/') continue;
      const asset = localAsset(pathname);
      const routeOutput = outputForPath(pathname);
      assert.ok(existsSync(asset) || existsSync(routeOutput), `${route} references missing ${pathname}`);
    }
  }

  for (const [route, path] of routes) {
    const html = text(path);
    // Don't: "force external links into a new tab".
    for (const link of matches(html, /<a\b[^>]*\btarget=(?:"[^"]*"|'[^']*')[^>]*>/gi).map((match) => match[0])) {
      assert.fail(`${route} link must open in the same tab (DESIGN.md Don'ts): ${link}`);
    }
    // Writing article: "Video exposes native controls".
    for (const video of matches(html, /<video\b[^>]*>/gi).map((match) => match[0])) {
      assert.match(video, /\scontrols(?:[\s=>])/i, `${route} video must expose native controls (DESIGN.md Writing article): ${video}`);
    }
    // Writing article: video has "a download fallback" inside the element.
    for (const [video, open] of matches(html, /(<video\b[^>]*>)[\s\S]*?<\/video>/gi).map((match) => [match[0], match[1]])) {
      const source = attribute(open, 'src') ?? video.match(/<source\b[^>]*\bsrc="([^"]+)"/i)?.[1];
      assert.ok(source && video.includes(`<a href="${source}"`), `${route} video must link its own file as a download fallback (DESIGN.md Writing article): ${open}`);
    }
    // Release gates: logical headings. Inside main, a heading never skips a level.
    const headingLevels = matches(html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? '', /<h([1-6])\b/gi).map((match) => Number(match[1]));
    for (const [index, level] of headingLevels.entries()) {
      if (index > 0) assert.ok(level <= headingLevels[index - 1] + 1, `${route} headings must not skip a level (h${headingLevels[index - 1]} then h${level}; DESIGN.md release gates)`);
    }
    // Shared footer: plain GitHub, LinkedIn, X, and Email links.
    const footer = matches(html, /<footer\b[^>]*class="site-footer[\s\S]*?<\/footer>/gi).map((match) => match[0]).join('');
    assert.match(footer, /href="mailto:[^"]+"/i, `${route} footer must include the Email link (DESIGN.md Shared footer)`);
  }
});
